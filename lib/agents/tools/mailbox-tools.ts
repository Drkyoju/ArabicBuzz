import { readMail, searchMail, sendMail } from '@/lib/email/mailbox'
import { syncImapInbox } from '@/lib/email/imap-sync'
import { isImapConfigured } from '@/lib/email/imap-store'
import { searchOrgMailCorpus } from '@/lib/email/mail-corpus-search'
import { analyzeMailMessage } from '@/lib/email/mail-intel'

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

function resolveMessageId(params: Record<string, unknown>): string {
  return String(
    params.messageId ||
      params.id ||
      params.openMailMessageId ||
      params._openMailMessageId ||
      ''
  ).trim()
}

/**
 * Unified mail search — IMAP first (inbox + sent + body), else Gmail.
 * Accepts Arabic free-text or Gmail-style queries (is:unread, …).
 * Searches the full local corpus by default (not inbox-only).
 */
export async function executeMailSearch(
  _name: string,
  params: Record<string, unknown>
) {
  const query = String(params.query || params.q || '').trim()
  const unreadOnly =
    params.unreadOnly === true ||
    /غير\s*مقرو|unread|is:unread/i.test(query)
  const maxResults =
    typeof params.maxResults === 'number'
      ? Math.min(Math.max(params.maxResults, 1), 50)
      : 40
  const result = await searchMail({
    query: query || (unreadOnly ? 'is:unread' : 'in:all'),
    unreadOnly,
    maxResults,
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
    folderScope: 'all',
    messages: result.messages,
    messageAr: result.messageAr,
  }
}

/** Full-corpus search: inbox + sent + attachment text + workspace files. */
export async function executeMailCorpusSearch(
  _name: string,
  params: Record<string, unknown>
) {
  const query = String(params.query || params.q || '').trim()
  if (!query) {
    return {
      ok: false,
      hits: [],
      messageAr: 'اكتب كلمة للبحث في كل بريد الجمعية (وارد/مرسل/مرفقات).',
    }
  }
  const limit =
    typeof params.maxResults === 'number'
      ? Math.min(Math.max(params.maxResults, 1), 60)
      : 40
  if (await isImapConfigured()) {
    await syncImapInbox({ maxMessages: 60, notifyTelegram: false }).catch(
      () => null
    )
  }
  const { hits, messageAr } = await searchOrgMailCorpus({
    query,
    limit,
    folder: 'all',
    includeFiles: params.includeFiles !== false,
  })
  return {
    ok: true,
    count: hits.length,
    hits,
    messageAr,
  }
}

export async function executeMailRead(
  _name: string,
  params: Record<string, unknown>
) {
  const messageId = resolveMessageId(params)
  if (!messageId) {
    return {
      ok: false,
      messageAr:
        'يلزم messageId — افتح رسالة في بريد الجمعية أو مرّر المعرّف من mail_search.',
    }
  }
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

/**
 * Analyze open/selected message: summary + full draft reply (edit-then-send).
 * Prefer messageId from the open mail UI focus when the user did not pass one.
 */
export async function executeMailDraftReply(
  _name: string,
  params: Record<string, unknown>
) {
  const messageId = resolveMessageId(params)
  if (!messageId) {
    return {
      ok: false,
      messageAr:
        'لا توجد رسالة مفتوحة — افتح رسالة في بريد الجمعية أو مرّر messageId من mail_search.',
      ctaAr: 'من بريد الجمعية: افتح الرسالة ثم اطلب «اكتب رد» أو مرّر المعرّف.',
    }
  }
  const force = params.force === true
  const result = await analyzeMailMessage(messageId, { force })
  const intel = result.intel
  const message = await readMail({
    messageId,
    userId: userIdOf(params),
    accountEmail: accountEmailOf(params),
  }).catch(() => null)

  return {
    ok: true,
    cached: result.cached,
    messageId,
    from: message?.from || '',
    subject: message?.subject || '',
    summaryAr: intel.summaryAr,
    draftSubject: intel.draftSubject,
    draftBody: intel.draftBody,
    extract: intel.extract,
    /** Hint for UI: fill reply composer; user edits or sends as-is. */
    uiHintAr:
      'المسودة جاهزة في بريد الجمعية — راجعها وعدّلها ثم أرسل، أو أرسل كما هي.',
    messageAr: result.messageAr,
    fallbackNoteAr: intel.fallbackNoteAr,
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
  const r = await syncImapInbox({ maxMessages: 80, notifyTelegram: true })
  return { ...r }
}
