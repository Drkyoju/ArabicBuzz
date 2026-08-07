import { readMail, searchMail, sendMail } from '@/lib/email/mailbox'
import { syncImapInbox } from '@/lib/email/imap-sync'
import { isImapConfigured } from '@/lib/email/imap-store'

function userIdOf(params: Record<string, unknown>): string | undefined {
  const userId = String(params.userId || params._userId || '').trim()
  if (!userId || userId === 'engine' || userId === 'local-owner') {
    return undefined
  }
  return userId
}

function accountEmailOf(params: Record<string, unknown>): string | undefined {
  const raw = params.accountEmail || params.email
  if (raw == null) return undefined
  const email = String(raw).trim().toLowerCase()
  return email.includes('@') ? email : undefined
}

/**
 * Unified mail search — IMAP first, else Gmail.
 * Accepts Arabic free-text or Gmail-style queries (is:unread, …).
 */
export async function executeMailSearch(
  _name: string,
  params: Record<string, unknown>
) {
  const query = String(params.query || params.q || '').trim()
  const unreadOnly =
    params.unreadOnly === true ||
    /غير\s*مقرو|unread|is:unread/i.test(query) ||
    !query
  const result = await searchMail({
    query: query || (unreadOnly ? 'is:unread' : 'in:inbox'),
    unreadOnly,
    maxResults:
      typeof params.maxResults === 'number' ? params.maxResults : 15,
    userId: userIdOf(params),
    accountEmail: accountEmailOf(params),
  })
  if (result.source === 'none') {
    return {
      ok: false,
      count: 0,
      messages: [],
      messageAr: result.messageAr,
      ctaAr:
        result.ctaAr ||
        'اربط بريد الجمعية من الإعدادات → بريد الجمعية (IMAP/SMTP) لـ info@alhuda-alhikma.sa',
    }
  }
  return {
    ok: true,
    source: result.source,
    count: result.messages.length,
    messages: result.messages,
    messageAr: result.messageAr,
  }
}

export async function executeMailRead(
  _name: string,
  params: Record<string, unknown>
) {
  const messageId = String(params.messageId || params.id || '').trim()
  const message = await readMail({
    messageId,
    userId: userIdOf(params),
    accountEmail: accountEmailOf(params),
  })
  return {
    ok: true,
    source: message.source,
    message,
    messageAr: `قُرئت الرسالة: ${message.subject || messageId}`,
  }
}

export async function executeMailSend(
  _name: string,
  params: Record<string, unknown>
) {
  const to = String(params.to || '').trim()
  const subject = String(params.subject || '').trim()
  const bodyText =
    params.bodyText != null ? String(params.bodyText) : undefined
  const bodyHtml =
    params.bodyHtml != null ? String(params.bodyHtml) : undefined
  const replyToMessageId =
    params.replyToMessageId != null
      ? String(params.replyToMessageId)
      : params.inReplyToMessageId != null
        ? String(params.inReplyToMessageId)
        : undefined

  const result = await sendMail({
    to,
    subject,
    bodyText,
    bodyHtml,
    cc: params.cc != null ? String(params.cc) : undefined,
    bcc: params.bcc != null ? String(params.bcc) : undefined,
    replyToMessageId,
    replyAll: params.replyAll === true,
    userId: userIdOf(params),
    accountEmail: accountEmailOf(params),
  })

  return {
    ...result,
  }
}

export async function executeMailSync(
  _name: string,
  _params: Record<string, unknown>
) {
  if (!(await isImapConfigured())) {
    return {
      ok: false,
      messageAr:
        'IMAP غير مضبوط — احفظ إعدادات البريد من الإعدادات → بريد الجمعية.',
      ctaAr:
        'اضبط IMAP/SMTP لـ info@alhuda-alhikma.sa (مضيف، منفذ، كلمة مرور التطبيق).',
    }
  }
  const r = await syncImapInbox({ maxMessages: 40, notifyTelegram: true })
  return { ...r }
}
