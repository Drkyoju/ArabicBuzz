/**
 * Unified mailbox facade: IMAP/SMTP first, Google Gmail as optional fallback.
 */
import {
  countUnread,
  getMessageById,
  getMailboxPublic,
  isImapConfigured,
  listMessages,
  type ImapMessageRow,
} from '@/lib/email/imap-store'
import { syncImapInbox } from '@/lib/email/imap-sync'
import { sendSmtpMail, type SendMailInput } from '@/lib/email/smtp-send'
import {
  readGmailMessage,
  searchGmailMessages,
  sendGmailMessage,
  type GmailMessageDetail,
  type GmailMessageSummary,
} from '@/lib/google/gmail'
import { listGoogleAccounts } from '@/lib/google/tokens'

export type UnifiedMailSummary = {
  id: string
  threadId?: string
  subject: string
  from: string
  to: string
  date?: string
  snippet: string
  /** Longer body preview so agents can search/skim without mail_read every hit. */
  bodyPreview?: string
  folder?: string
  seen?: boolean
  source: 'imap' | 'gmail'
  messageIdHeader?: string | null
}

export type UnifiedMailDetail = UnifiedMailSummary & {
  bodyText: string
  bodyHtml?: string
  cc?: string
  inReplyTo?: string | null
}

function fromImapRow(row: ImapMessageRow): UnifiedMailDetail {
  return {
    id: row.id,
    subject: row.subject,
    from: row.from_addr,
    to: row.to_addr,
    date: row.date_at ? new Date(row.date_at).toISOString() : undefined,
    snippet: row.snippet,
    seen: row.seen,
    source: 'imap',
    messageIdHeader: row.message_id,
    bodyText: row.body_text,
    bodyHtml: row.body_html || undefined,
    cc: row.cc_addr || undefined,
    inReplyTo: row.in_reply_to,
  }
}

export async function mailBackendStatus(opts?: {
  userId?: string
}): Promise<{
  imap: boolean
  gmail: boolean
  preferred: 'imap' | 'gmail' | 'none'
  emailAddress: string | null
  unread: number
  ctaAr: string | null
}> {
  const imap = await isImapConfigured()
  let gmail = false
  const userId =
    opts?.userId ||
    process.env.CHANNEL_OWNER_USER_ID ||
    process.env.DRIVE_BRAIN_OWNER_USER_ID ||
    ''
  if (userId && userId !== 'local-owner') {
    try {
      const accounts = await listGoogleAccounts(userId)
      gmail = accounts.length > 0
    } catch {
      gmail = false
    }
  }
  const pub = imap ? await getMailboxPublic() : null
  const unread = imap ? await countUnread() : 0
  const preferred = imap ? 'imap' : gmail ? 'gmail' : 'none'
  let ctaAr: string | null = null
  if (preferred === 'none') {
    ctaAr =
      'اربط بريد الجمعية عبر IMAP/SMTP من الإعدادات → «بريد الجمعية» (موصى به لـ info@alhuda-alhikma.sa) أو اربط Google إن توفر Workspace.'
  }
  return {
    imap,
    gmail,
    preferred,
    emailAddress: pub?.emailAddress || null,
    unread,
    ctaAr,
  }
}

export async function searchMail(opts: {
  query?: string
  unreadOnly?: boolean
  maxResults?: number
  userId?: string
  accountEmail?: string | null
}): Promise<{
  source: 'imap' | 'gmail' | 'none'
  messages: UnifiedMailSummary[]
  messageAr: string
  ctaAr?: string
}> {
  const status = await mailBackendStatus({ userId: opts.userId })
  if (status.preferred === 'imap') {
    // Ensure local cache is reasonably fresh for assistant runs (inbox+sent).
    await syncImapInbox({ maxMessages: 60, notifyTelegram: false }).catch(
      () => null
    )
    const q = (opts.query || '').trim()
    const unreadOnly =
      opts.unreadOnly ||
      /unread|غير\s*مقرو|is:unread|label:unread/i.test(q)
    const queryClean = q
      .replace(/is:unread|label:unread|غير\s*مقروء[ة]?/gi, '')
      .replace(/in:all|in:anywhere|الكل/gi, '')
      .replace(/newer_than:\S+/gi, '')
      .trim()
    const rows = await listMessages({
      unreadOnly,
      query: queryClean || undefined,
      limit: opts.maxResults || 40,
      folder: 'all',
    })
    const messages = rows.map((r) => {
      const d = fromImapRow(r)
      const bodyPreview = (r.body_text || r.snippet || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 600)
      return {
        id: d.id,
        subject: d.subject,
        from: d.from,
        to: d.to,
        date: d.date,
        snippet: d.snippet,
        bodyPreview,
        folder: r.folder,
        seen: d.seen,
        source: 'imap' as const,
        messageIdHeader: d.messageIdHeader,
      }
    })
    return {
      source: 'imap',
      messages,
      messageAr:
        messages.length === 0
          ? 'لا رسائل مطابقة في بريد IMAP (وارد+مرسل).'
          : `وُجد ${messages.length} رسالة عبر IMAP في الوارد والمرسل.`,
    }
  }

  if (status.preferred === 'gmail' && opts.userId) {
    const query =
      (opts.query || '').trim() ||
      (opts.unreadOnly ? 'is:unread' : 'in:inbox newer_than:14d')
    const { messages: found } = await searchGmailMessages(opts.userId, {
      query,
      maxResults: opts.maxResults,
      accountEmail: opts.accountEmail,
    })
    return {
      source: 'gmail',
      messages: found.map((m: GmailMessageSummary) => ({
        ...m,
        source: 'gmail' as const,
      })),
      messageAr:
        found.length === 0
          ? `لا نتائج Gmail لـ «${query}».`
          : `وُجد ${found.length} رسالة عبر Gmail.`,
    }
  }

  return {
    source: 'none',
    messages: [],
    messageAr: 'لا بريد مربوط.',
    ctaAr: status.ctaAr || undefined,
  }
}

export async function readMail(opts: {
  messageId: string
  userId?: string
  accountEmail?: string | null
}): Promise<UnifiedMailDetail> {
  const id = opts.messageId.trim()
  if (!id) throw new Error('يلزم messageId.')

  // IMAP ids look like imsg_* or uuid; try local first always.
  const local = await getMessageById(id)
  if (local) return fromImapRow(local)

  if (opts.userId) {
    const g: GmailMessageDetail = await readGmailMessage(opts.userId, id, {
      accountEmail: opts.accountEmail,
    })
    return { ...g, source: 'gmail' }
  }

  throw new Error(
    'الرسالة غير موجودة محلياً — زامن IMAP أو اربط Google واقرأ عبر Gmail.'
  )
}

export async function sendMail(opts: SendMailInput & {
  userId?: string
  accountEmail?: string | null
}): Promise<{
  ok: boolean
  source: 'imap' | 'gmail'
  messageId?: string
  threadId?: string
  to: string
  subject: string
  messageAr: string
}> {
  if (await isImapConfigured()) {
    const r = await sendSmtpMail(opts)
    return {
      ok: true,
      source: 'imap',
      messageId: r.messageId,
      to: r.to,
      subject: r.subject,
      messageAr: r.messageAr,
    }
  }

  if (!opts.userId) {
    throw new Error(
      'اربط بريد الجمعية عبر IMAP/SMTP من الإعدادات، أو اربط Google لإرسال Gmail.'
    )
  }

  const r = await sendGmailMessage(opts.userId, {
    to: opts.to,
    subject: opts.subject,
    bodyText: opts.bodyText,
    bodyHtml: opts.bodyHtml,
    cc: opts.cc,
    bcc: opts.bcc,
    accountEmail: opts.accountEmail,
  })
  return {
    ok: true,
    source: 'gmail',
    messageId: r.id,
    threadId: r.threadId,
    to: opts.to,
    subject: opts.subject,
    messageAr: `أُرسل البريد عبر Gmail إلى ${opts.to} — الموضوع: ${opts.subject}`,
  }
}
