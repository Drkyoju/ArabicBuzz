import { ImapFlow } from 'imapflow'
import { TextDecoder } from 'util'
import {
  getMailboxCreds,
  listUnnotified,
  markNotified,
  markSyncResult,
  upsertMessage,
  type ImapMailboxCreds,
} from '@/lib/email/imap-store'
import { emitNotification } from '@/lib/notifications/emit'

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function addrList(
  value:
    | { address?: string | null; name?: string | null }[]
    | undefined
    | null
): string {
  if (!value?.length) return ''
  return value
    .map((a) => {
      const addr = a.address || ''
      const name = a.name || ''
      if (name && addr) return `${name} <${addr}>`
      return addr || name
    })
    .filter(Boolean)
    .join(', ')
}

function snippetOf(text: string, max = 240): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

async function withClient<T>(
  creds: ImapMailboxCreds,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: creds.imapSecure,
    auth: {
      user: creds.username,
      pass: creds.password,
    },
    logger: false,
    emitLogs: false,
    // Netlify functions die hard on hung IMAP — fail fast instead of hanging.
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 25_000,
  })
  try {
    await client.connect()
    return await fn(client)
  } finally {
    try {
      await client.logout()
    } catch {
      try {
        client.close()
      } catch {
        /* ignore */
      }
    }
  }
}

export type SyncResult = {
  ok: boolean
  fetched: number
  newCount: number
  unreadNotified: number
  lastUid: number
  errorAr?: string
  messageAr: string
}

/**
 * Incremental IMAP sync of INBOX (UID > last_uid + UNSEEN).
 * Stores AR/EN bodies as plain text (+ HTML when present).
 */
export async function syncImapInbox(opts?: {
  maxMessages?: number
  notifyTelegram?: boolean
}): Promise<SyncResult> {
  const creds = await getMailboxCreds()
  if (!creds) {
    return {
      ok: false,
      fetched: 0,
      newCount: 0,
      unreadNotified: 0,
      lastUid: 0,
      errorAr:
        'لم يُضبط بريد IMAP بعد — من الإعدادات → بريد الجمعية (IMAP/SMTP).',
      messageAr: 'بريد IMAP غير مضبوط.',
    }
  }

  const maxMessages = Math.min(Math.max(opts?.maxMessages || 40, 1), 80)
  let fetched = 0
  let newCount = 0
  let maxUid = creds.lastUid

  try {
    await withClient(creds, async (client) => {
      const lock = await client.getMailboxLock('INBOX')
      try {
        const mailbox = client.mailbox
        if (!mailbox || typeof mailbox === 'boolean') {
          throw new Error('تعذّر فتح صندوق الوارد INBOX.')
        }

        const uidSet = new Set<number>()

        if (creds.lastUid > 0) {
          const newer = await client.search(
            { uid: `${creds.lastUid + 1}:*` },
            { uid: true }
          )
          for (const u of newer || []) uidSet.add(Number(u))
        }

        const unseen = await client.search({ seen: false }, { uid: true })
        for (const u of unseen || []) uidSet.add(Number(u))

        // First sync: newest N by UID
        if (creds.lastUid === 0 && uidSet.size === 0) {
          const exists =
            typeof mailbox.exists === 'number' ? mailbox.exists : 0
          if (exists > 0) {
            const startSeq = Math.max(1, exists - maxMessages + 1)
            for await (const msg of client.fetch(`${startSeq}:${exists}`, {
              uid: true,
            })) {
              if (typeof msg.uid === 'number') uidSet.add(msg.uid)
            }
          }
        }

        const selected = [...uidSet]
          .filter((u) => Number.isFinite(u) && u > 0)
          .sort((a, b) => b - a)
          .slice(0, maxMessages)

        for (const uid of selected) {
          let bodyText = ''
          let bodyHtml = ''
          let subject = '(بدون موضوع)'
          let fromAddr = ''
          let toAddr = ''
          let ccAddr = ''
          let messageId: string | null = null
          let inReplyTo: string | null = null
          let dateAt: Date | null = null
          let seen = false
          let answered = false

          try {
            const downloaded = await client.fetchOne(
              String(uid),
              {
                uid: true,
                flags: true,
                envelope: true,
                source: true,
              },
              { uid: true }
            )
            if (!downloaded || typeof downloaded === 'boolean') continue

            const envelope = downloaded.envelope
            const flags = downloaded.flags || new Set<string>()
            seen = flags.has('\\Seen')
            answered = flags.has('\\Answered')
            subject = String(envelope?.subject || '(بدون موضوع)')
            fromAddr = addrList(envelope?.from)
            toAddr = addrList(envelope?.to)
            ccAddr = addrList(envelope?.cc)
            messageId = envelope?.messageId
              ? String(envelope.messageId)
              : null
            inReplyTo = envelope?.inReplyTo
              ? String(envelope.inReplyTo)
              : null
            dateAt = envelope?.date ? new Date(envelope.date) : null

            if (downloaded.source) {
              const raw = Buffer.isBuffer(downloaded.source)
                ? downloaded.source.toString('utf8')
                : String(downloaded.source)
              const parsed = parseMimeBodies(raw)
              bodyText = parsed.text
              bodyHtml = parsed.html
            }
          } catch {
            continue
          }

          if (!bodyText && bodyHtml) bodyText = htmlToText(bodyHtml)
          if (!bodyText) bodyText = subject

          const { isNew } = await upsertMessage({
            mailboxId: creds.id,
            uid,
            messageId,
            inReplyTo,
            referencesHdr: null,
            folder: 'INBOX',
            subject,
            fromAddr,
            toAddr,
            ccAddr,
            dateAt,
            snippet: snippetOf(bodyText),
            bodyText: bodyText.slice(0, 50_000),
            bodyHtml: bodyHtml ? bodyHtml.slice(0, 80_000) : null,
            seen,
            answered,
          })
          fetched += 1
          if (isNew) newCount += 1
          if (uid > maxUid) maxUid = uid
        }
      } finally {
        lock.release()
      }
    })

    await markSyncResult({ mailboxId: creds.id, lastUid: maxUid })

    let unreadNotified = 0
    const shouldNotify =
      opts?.notifyTelegram !== false && creds.notifyTelegram
    if (shouldNotify) {
      unreadNotified = await notifyNewMailTelegram()
    }

    return {
      ok: true,
      fetched,
      newCount,
      unreadNotified,
      lastUid: maxUid,
      messageAr:
        fetched === 0
          ? 'لا رسائل جديدة للمزامنة.'
          : `تمت مزامنة ${fetched} رسالة (${newCount} جديدة)${
              unreadNotified ? ` · أُخطر تيليجرام بـ ${unreadNotified}` : ''
            }.`,
    }
  } catch (e) {
    const errorAr =
      e instanceof Error
        ? e.message
        : 'فشل مزامنة IMAP — تحقق من المضيف وكلمة المرور.'
    await markSyncResult({ mailboxId: creds.id, errorAr }).catch(() => null)
    return {
      ok: false,
      fetched,
      newCount,
      unreadNotified: 0,
      lastUid: maxUid,
      errorAr,
      messageAr: errorAr,
    }
  }
}

/** Minimal MIME extractor for text/plain + text/html (AR/EN UTF-8). */
function parseMimeBodies(raw: string): { text: string; html: string } {
  const out = { text: '', html: '' }
  if (!raw) return out

  const boundaryMatch = raw.match(/boundary="?([^";\r\n]+)"?/i)
  if (!boundaryMatch) {
    const body = raw.split(/\r?\n\r?\n/).slice(1).join('\n\n')
    if (/Content-Type:\s*text\/html/i.test(raw)) {
      out.html = decodeTransfer(raw, body)
    } else {
      out.text = decodeTransfer(raw, body)
    }
    return out
  }

  const boundary = boundaryMatch[1]
  const parts = raw.split(new RegExp(`--${escapeReg(boundary)}`))
  for (const part of parts) {
    if (!part || part.startsWith('--')) continue
    const [hdrRaw, ...rest] = part.split(/\r?\n\r?\n/)
    const headers = hdrRaw || ''
    const body = rest.join('\n\n').replace(/--\s*$/, '').trim()
    if (/Content-Type:\s*text\/plain/i.test(headers) && !out.text) {
      out.text = decodeTransfer(headers, body)
    } else if (/Content-Type:\s*text\/html/i.test(headers) && !out.html) {
      out.html = decodeTransfer(headers, body)
    }
  }
  return out
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeTransfer(headers: string, body: string): string {
  const cte = (headers.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1] || '')
    .toLowerCase()
    .trim()
  const charset =
    headers.match(/charset="?([^";\s]+)"?/i)?.[1]?.toLowerCase() || 'utf-8'
  let buf: Buffer
  if (cte === 'base64') {
    buf = Buffer.from(body.replace(/\s+/g, ''), 'base64')
  } else if (cte === 'quoted-printable') {
    const qp = body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, h: string) =>
        String.fromCharCode(parseInt(h, 16))
      )
    buf = Buffer.from(qp, 'latin1')
  } else {
    buf = Buffer.from(body, 'utf8')
  }
  try {
    const enc = charset === 'utf8' ? 'utf-8' : charset
    return new TextDecoder(enc).decode(buf)
  } catch {
    return buf.toString('utf8')
  }
}

async function notifyNewMailTelegram(): Promise<number> {
  const rows = await listUnnotified(8)
  if (!rows.length) return 0
  const lines = ['📬 بريد جديد — Arabic Buzz', '']
  for (const m of rows) {
    lines.push(`• ${m.subject || '(بدون موضوع)'}`)
    lines.push(`  من: ${m.from_addr || '—'}`)
    if (m.snippet) lines.push(`  ${m.snippet.slice(0, 120)}`)
    lines.push('')
  }
  lines.push('👉 راجع الوارد: https://arabicbuzz.netlify.app/?section=mail')
  const r = await emitNotification({
    channel: 'telegram',
    textAr: lines.join('\n').slice(0, 3500),
  })
  if (r.ok) {
    await markNotified(rows.map((m) => m.id))
    return rows.length
  }
  return 0
}

/** Quick connectivity test (login + INBOX status). */
export async function testImapConnection(): Promise<{
  ok: boolean
  messageAr: string
}> {
  const creds = await getMailboxCreds()
  if (!creds) {
    return {
      ok: false,
      messageAr: 'لا إعدادات IMAP محفوظة.',
    }
  }
  try {
    const status = await withClient(creds, async (client) => {
      const lock = await client.getMailboxLock('INBOX')
      try {
        const mb = client.mailbox
        const exists =
          mb && typeof mb !== 'boolean' && typeof mb.exists === 'number'
            ? mb.exists
            : 0
        return exists
      } finally {
        lock.release()
      }
    })
    return {
      ok: true,
      messageAr: `الاتصال ناجح — صندوق الوارد يحتوي ${status} رسالة تقريباً.`,
    }
  } catch (e) {
    return {
      ok: false,
      messageAr:
        e instanceof Error
          ? `فشل الاتصال: ${e.message}`
          : 'فشل الاتصال بـ IMAP.',
    }
  }
}
