import { ImapFlow } from 'imapflow'
import {
  getMailboxCreds,
  listUnnotified,
  markNotified,
  markSyncResult,
  upsertMessage,
  type ImapMailboxCreds,
} from '@/lib/email/imap-store'
import { emitNotification } from '@/lib/notifications/emit'
import { isTelegramGroupPushAllowed } from '@/lib/telegram/group-push-policy'
import {
  extractAttachmentTexts,
  parseMimeMessage,
} from '@/lib/email/mail-attachments'

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

const SENT_CANDIDATES = [
  'Sent',
  'Sent Items',
  'Sent Messages',
  'INBOX.Sent',
  '[Gmail]/Sent Mail',
  'المرسل',
  'رسائل مرسلة',
]

async function resolveSentMailboxPath(
  client: ImapFlow
): Promise<string | null> {
  try {
    const boxes = await client.list()
    const paths = boxes.map((b) => b.path)
    for (const c of SENT_CANDIDATES) {
      if (paths.includes(c)) return c
    }
    const fuzzy = paths.find((p) => /sent|مرسل/i.test(p))
    return fuzzy || null
  } catch {
    return null
  }
}

type FolderSyncStats = {
  fetched: number
  newCount: number
  maxUid: number
}

async function syncOneFolder(opts: {
  client: ImapFlow
  mailboxId: string
  /** IMAP path to open */
  imapPath: string
  /** Normalized folder label stored in DB */
  storeFolder: string
  lastUid: number
  maxMessages: number
  /** For Sent: do not chase UNSEEN */
  includeUnseen: boolean
}): Promise<FolderSyncStats> {
  const {
    client,
    mailboxId,
    imapPath,
    storeFolder,
    lastUid,
    maxMessages,
    includeUnseen,
  } = opts
  let fetched = 0
  let newCount = 0
  let maxUid = lastUid

  const lock = await client.getMailboxLock(imapPath)
  try {
    const mailbox = client.mailbox
    if (!mailbox || typeof mailbox === 'boolean') {
      throw new Error(`تعذّر فتح الصندوق ${imapPath}.`)
    }

    const uidSet = new Set<number>()

    if (lastUid > 0) {
      const newer = await client.search(
        { uid: `${lastUid + 1}:*` },
        { uid: true }
      )
      for (const u of newer || []) uidSet.add(Number(u))
    }

    if (includeUnseen) {
      const unseen = await client.search({ seen: false }, { uid: true })
      for (const u of unseen || []) uidSet.add(Number(u))
    }

    if (lastUid === 0 && uidSet.size === 0) {
      const exists = typeof mailbox.exists === 'number' ? mailbox.exists : 0
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
      let seen = storeFolder !== 'INBOX'
      let answered = false
      let attachmentsJson: unknown = null

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
        seen = flags.has('\\Seen') || storeFolder !== 'INBOX'
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
            ? downloaded.source.toString('binary')
            : String(downloaded.source)
          const parsed = parseMimeMessage(raw)
          bodyText = parsed.text
          bodyHtml = parsed.html
          if (parsed.attachments.length) {
            const slice = parsed.attachments.slice(0, 6)
            attachmentsJson = await extractAttachmentTexts(slice)
          }
        }
      } catch {
        continue
      }

      if (!bodyText && bodyHtml) bodyText = htmlToText(bodyHtml)
      if (!bodyText) bodyText = subject

      const { isNew } = await upsertMessage({
        mailboxId,
        uid,
        messageId,
        inReplyTo,
        referencesHdr: null,
        folder: storeFolder,
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
        attachmentsJson,
      })
      fetched += 1
      if (isNew) newCount += 1
      if (uid > maxUid) maxUid = uid
    }
  } finally {
    lock.release()
  }

  return { fetched, newCount, maxUid }
}

export type SyncResult = {
  ok: boolean
  fetched: number
  newCount: number
  unreadNotified: number
  lastUid: number
  lastUidSent?: number
  sentFetched?: number
  errorAr?: string
  messageAr: string
}

/**
 * Incremental IMAP sync of INBOX + Sent (when available).
 * Stores AR/EN bodies as plain text (+ HTML when present) and extracts attachment text.
 */
export async function syncImapInbox(opts?: {
  maxMessages?: number
  notifyTelegram?: boolean
  /** Also sync Sent (default true). */
  includeSent?: boolean
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
  const includeSent = opts?.includeSent !== false
  let fetched = 0
  let newCount = 0
  let maxUid = creds.lastUid
  let maxUidSent = creds.lastUidSent
  let sentFetched = 0

  try {
    await withClient(creds, async (client) => {
      const inbox = await syncOneFolder({
        client,
        mailboxId: creds.id,
        imapPath: 'INBOX',
        storeFolder: 'INBOX',
        lastUid: creds.lastUid,
        maxMessages,
        includeUnseen: true,
      })
      fetched += inbox.fetched
      newCount += inbox.newCount
      maxUid = inbox.maxUid

      if (includeSent) {
        const sentPath = await resolveSentMailboxPath(client)
        if (sentPath) {
          const sent = await syncOneFolder({
            client,
            mailboxId: creds.id,
            imapPath: sentPath,
            storeFolder: 'Sent',
            lastUid: creds.lastUidSent,
            maxMessages: Math.min(maxMessages, 30),
            includeUnseen: false,
          })
          sentFetched = sent.fetched
          fetched += sent.fetched
          newCount += sent.newCount
          maxUidSent = sent.maxUid
        }
      }
    })

    await markSyncResult({
      mailboxId: creds.id,
      lastUid: maxUid,
      lastUidSent: maxUidSent,
    })

    let unreadNotified = 0
    const shouldNotify =
      opts?.notifyTelegram !== false && creds.notifyTelegram
    if (shouldNotify) {
      unreadNotified = await notifyNewMailTelegram()
    }

    const parts: string[] = []
    if (fetched === 0) {
      parts.push('لا رسائل جديدة للمزامنة.')
    } else {
      parts.push(
        `تمت مزامنة ${fetched} رسالة (${newCount} جديدة)${
          sentFetched ? ` منها ${sentFetched} من المرسل` : ''
        }`
      )
    }
    if (unreadNotified) parts.push(`أُخطر تيليجرام بـ ${unreadNotified}`)

    return {
      ok: true,
      fetched,
      newCount,
      unreadNotified,
      lastUid: maxUid,
      lastUidSent: maxUidSent,
      sentFetched,
      messageAr: parts.join(' · ') + (parts[0].endsWith('.') ? '' : '.'),
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
      lastUidSent: maxUidSent,
      errorAr,
      messageAr: errorAr,
    }
  }
}

async function notifyNewMailTelegram(): Promise<number> {
  if (!isTelegramGroupPushAllowed('imap_notify')) return 0
  const rows = await listUnnotified(8)
  if (!rows.length) return 0
  const lines = ['📬 بريد جديد — Arabic Buzz', '']
  for (const m of rows) {
    lines.push(`• ${m.subject || '(بدون موضوع)'}`)
    lines.push(`  من: ${m.from_addr || '—'}`)
    if (m.snippet) lines.push(`  ${m.snippet.slice(0, 120)}`)
    lines.push('')
  }
  lines.push('👉 راجع الوارد: https://arabicbuzz-fooc9h.cranl.net/?section=mail')
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
          ? `فشل IMAP: ${e.message}`
          : 'فشل الاتصال بـ IMAP.',
    }
  }
}
