import { getValidGoogleAccessToken } from '@/lib/google/tokens'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1'

export type GmailMessageSummary = {
  id: string
  threadId?: string
  subject: string
  from: string
  to: string
  date?: string
  snippet: string
  labelIds?: string[]
  unread?: boolean
  starred?: boolean
  hasAttachment?: boolean
}

export type GmailAttachmentMeta = {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
}

export type GmailMessageDetail = GmailMessageSummary & {
  bodyText: string
  bodyHtml?: string
  cc?: string
  messageIdHeader?: string
  references?: string
  attachments: GmailAttachmentMeta[]
}

export type GmailLabel = {
  id: string
  name: string
  type?: string
  messagesUnread?: number
  messagesTotal?: number
}

async function gmailFetch(
  userId: string,
  pathAndQuery: string,
  init?: RequestInit & { accountEmail?: string | null }
): Promise<Response> {
  const accountEmail = init?.accountEmail
  const { accountEmail: _drop, ...rest } = init || {}
  void _drop
  const tok = await getValidGoogleAccessToken(userId, accountEmail)
  if (!tok.ok) throw new Error(tok.error)
  const headers = new Headers(rest.headers)
  headers.set('Authorization', `Bearer ${tok.accessToken}`)
  if (rest.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${GMAIL_BASE}${pathAndQuery}`, { ...rest, headers })
}

function headerOf(
  headers: Array<{ name: string; value: string }> | undefined,
  name: string
) {
  return (
    headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    ''
  )
}

function decodeBodyData(data?: string): string {
  if (!data) return ''
  try {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(b64, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

type MimePart = {
  mimeType?: string
  filename?: string
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: MimePart[]
  headers?: Array<{ name: string; value: string }>
}

function collectBodies(part: MimePart | undefined, out: { text: string; html: string }) {
  if (!part) return
  const mime = (part.mimeType || '').toLowerCase()
  const decoded = decodeBodyData(part.body?.data)
  if (mime === 'text/plain' && decoded) out.text += decoded
  if (mime === 'text/html' && decoded) out.html += decoded
  for (const child of part.parts || []) collectBodies(child, out)
}

function collectAttachments(
  part: MimePart | undefined,
  out: GmailAttachmentMeta[]
) {
  if (!part) return
  const filename = part.filename?.trim()
  const attachmentId = part.body?.attachmentId
  if (filename && attachmentId) {
    out.push({
      attachmentId,
      filename,
      mimeType: part.mimeType || 'application/octet-stream',
      size: Number(part.body?.size || 0),
    })
  }
  for (const child of part.parts || []) collectAttachments(child, out)
}

function toSummary(msg: {
  id?: string
  threadId?: string
  snippet?: string
  labelIds?: string[]
  payload?: {
    headers?: Array<{ name: string; value: string }>
    parts?: MimePart[]
    filename?: string
    body?: { attachmentId?: string }
  }
}): GmailMessageSummary {
  const headers = msg.payload?.headers
  const labelIds = msg.labelIds || []
  const hasAttachment = Boolean(
    msg.payload?.filename ||
      msg.payload?.body?.attachmentId ||
      (msg.payload?.parts || []).some(
        (p) => p.filename || p.body?.attachmentId
      )
  )
  return {
    id: String(msg.id || ''),
    threadId: msg.threadId,
    subject: headerOf(headers, 'Subject'),
    from: headerOf(headers, 'From'),
    to: headerOf(headers, 'To'),
    date: headerOf(headers, 'Date') || undefined,
    snippet: String(msg.snippet || ''),
    labelIds,
    unread: labelIds.includes('UNREAD'),
    starred: labelIds.includes('STARRED'),
    hasAttachment,
  }
}

/** Folder → Gmail query fragment. */
export function gmailQueryForFolder(
  folder: 'INBOX' | 'SENT' | 'STARRED' | 'IMPORTANT' | 'ALL' | 'UNREAD' | string
): string {
  switch (folder) {
    case 'INBOX':
      return 'in:inbox'
    case 'SENT':
      return 'in:sent'
    case 'STARRED':
      return 'is:starred'
    case 'IMPORTANT':
      return 'is:important'
    case 'UNREAD':
      return 'is:unread'
    case 'ALL':
      return 'in:anywhere'
    default:
      return folder.trim() || 'in:inbox'
  }
}

/**
 * Search Gmail with a Gmail query string (e.g. `from:x newer_than:7d`).
 */
export async function searchGmailMessages(
  userId: string,
  opts: {
    query: string
    maxResults?: number
    pageToken?: string | null
    accountEmail?: string | null
  }
): Promise<{
  messages: GmailMessageSummary[]
  nextPageToken?: string
  resultSizeEstimate?: number
}> {
  const q = opts.query.trim()
  if (!q) throw new Error('يلزم استعلام بحث (query) لـ Gmail.')
  const accountEmail = opts.accountEmail || null

  const listParams = new URLSearchParams({
    q,
    maxResults: String(Math.min(Math.max(opts.maxResults || 25, 1), 50)),
  })
  if (opts.pageToken) listParams.set('pageToken', opts.pageToken)

  const listRes = await gmailFetch(userId, `/users/me/messages?${listParams}`, {
    accountEmail,
  })
  const listData = (await listRes.json()) as {
    messages?: Array<{ id: string }>
    nextPageToken?: string
    resultSizeEstimate?: number
    error?: { message?: string }
  }
  if (!listRes.ok) {
    throw new Error(
      listData.error?.message ||
        `Gmail search HTTP ${listRes.status} — أعد ربط Google بصلاحية gmail.readonly`
    )
  }

  const out: GmailMessageSummary[] = []
  for (const m of listData.messages || []) {
    const msgRes = await gmailFetch(
      userId,
      `/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
      { accountEmail }
    )
    if (!msgRes.ok) continue
    const msg = (await msgRes.json()) as Parameters<typeof toSummary>[0] & {
      labelIds?: string[]
    }
    out.push(toSummary({ ...msg, id: msg.id || m.id }))
  }
  return {
    messages: out,
    nextPageToken: listData.nextPageToken,
    resultSizeEstimate: listData.resultSizeEstimate,
  }
}

/** List mailbox by folder or free-text / Gmail query. */
export async function listGmailMailbox(
  userId: string,
  opts: {
    folder?: string
    query?: string
    maxResults?: number
    pageToken?: string | null
    accountEmail?: string | null
  }
) {
  const folderQ = gmailQueryForFolder(opts.folder || 'INBOX')
  const extra = (opts.query || '').trim()
  const q = extra
    ? extra.includes(':') || /^(in:|is:|from:|to:|subject:|has:)/i.test(extra)
      ? extra
      : `${folderQ} ${extra}`
    : folderQ
  return searchGmailMessages(userId, {
    query: q,
    maxResults: opts.maxResults,
    pageToken: opts.pageToken,
    accountEmail: opts.accountEmail,
  })
}

/** Read one Gmail message body (plain text preferred) + attachment metas. */
export async function readGmailMessage(
  userId: string,
  messageId: string,
  opts?: { accountEmail?: string | null }
): Promise<GmailMessageDetail> {
  const id = messageId.trim()
  if (!id) throw new Error('يلزم messageId.')

  const res = await gmailFetch(userId, `/users/me/messages/${id}?format=full`, {
    accountEmail: opts?.accountEmail || null,
  })
  const data = (await res.json()) as {
    id?: string
    threadId?: string
    snippet?: string
    labelIds?: string[]
    payload?: MimePart
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message ||
        `Gmail read HTTP ${res.status} — أعد ربط Google بصلاحية gmail.readonly`
    )
  }

  const bodies = { text: '', html: '' }
  collectBodies(data.payload, bodies)
  const attachments: GmailAttachmentMeta[] = []
  collectAttachments(data.payload, attachments)
  const summary = toSummary(data)
  const bodyText =
    bodies.text.trim() ||
    bodies.html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() ||
    summary.snippet

  return {
    ...summary,
    bodyText: bodyText.slice(0, 20_000),
    bodyHtml: bodies.html ? bodies.html.slice(0, 40_000) : undefined,
    cc: headerOf(data.payload?.headers, 'Cc') || undefined,
    messageIdHeader: headerOf(data.payload?.headers, 'Message-ID') || undefined,
    references: headerOf(data.payload?.headers, 'References') || undefined,
    attachments,
  }
}

/** Search messages that have attachments matching filename/keyword. */
export async function searchGmailAttachments(
  userId: string,
  opts: { query: string; maxResults?: number; accountEmail?: string | null }
): Promise<
  Array<GmailMessageSummary & { attachments: GmailAttachmentMeta[] }>
> {
  const raw = opts.query.trim()
  const q = raw
    ? raw.includes('has:attachment')
      ? raw
      : `has:attachment ${raw}`
    : 'has:attachment'
  const { messages } = await searchGmailMessages(userId, {
    query: q,
    maxResults: opts.maxResults || 15,
    accountEmail: opts.accountEmail,
  })
  const out: Array<GmailMessageSummary & { attachments: GmailAttachmentMeta[] }> =
    []
  for (const m of messages) {
    try {
      const full = await readGmailMessage(userId, m.id, {
        accountEmail: opts.accountEmail,
      })
      if (!full.attachments.length) continue
      out.push({ ...m, attachments: full.attachments })
    } catch {
      /* skip */
    }
  }
  return out
}

/** List user labels (folders). */
export async function listGmailLabels(
  userId: string,
  opts?: { accountEmail?: string | null }
): Promise<GmailLabel[]> {
  const res = await gmailFetch(userId, '/users/me/labels', {
    accountEmail: opts?.accountEmail || null,
  })
  const data = (await res.json()) as {
    labels?: Array<{
      id: string
      name: string
      type?: string
      messagesUnread?: number
      messagesTotal?: number
    }>
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message || `Gmail labels HTTP ${res.status}`
    )
  }
  return (data.labels || []).map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    messagesUnread: l.messagesUnread,
    messagesTotal: l.messagesTotal,
  }))
}

/**
 * Modify labels (read/unread/star). Requires gmail.modify scope.
 */
export async function modifyGmailLabels(
  userId: string,
  messageId: string,
  opts: {
    addLabelIds?: string[]
    removeLabelIds?: string[]
    accountEmail?: string | null
  }
): Promise<GmailMessageSummary> {
  const id = messageId.trim()
  if (!id) throw new Error('يلزم messageId.')
  const res = await gmailFetch(userId, `/users/me/messages/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({
      addLabelIds: opts.addLabelIds || [],
      removeLabelIds: opts.removeLabelIds || [],
    }),
    accountEmail: opts.accountEmail || null,
  })
  const data = (await res.json()) as Parameters<typeof toSummary>[0] & {
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message ||
        `Gmail modify HTTP ${res.status} — أعد ربط Google بصلاحية gmail.modify`
    )
  }
  return toSummary(data)
}

export async function markGmailRead(
  userId: string,
  messageId: string,
  opts?: { unread?: boolean; accountEmail?: string | null }
) {
  const unread = opts?.unread === true
  return modifyGmailLabels(userId, messageId, {
    addLabelIds: unread ? ['UNREAD'] : [],
    removeLabelIds: unread ? [] : ['UNREAD'],
    accountEmail: opts?.accountEmail,
  })
}

export async function starGmailMessage(
  userId: string,
  messageId: string,
  opts?: { starred?: boolean; accountEmail?: string | null }
) {
  const starred = opts?.starred !== false
  return modifyGmailLabels(userId, messageId, {
    addLabelIds: starred ? ['STARRED'] : [],
    removeLabelIds: starred ? [] : ['STARRED'],
    accountEmail: opts?.accountEmail,
  })
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** RFC 2047 encoded-word so Arabic subjects survive SMTP headers. */
function encodeHeaderUtf8(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function buildRawMime(opts: {
  to: string
  subject: string
  bodyText: string
  bodyHtml?: string
  cc?: string
  bcc?: string
  inReplyTo?: string
  references?: string
}): string {
  const lines: string[] = [
    `To: ${opts.to}`,
    `Subject: ${encodeHeaderUtf8(opts.subject)}`,
  ]
  if (opts.cc) lines.push(`Cc: ${opts.cc}`)
  if (opts.bcc) lines.push(`Bcc: ${opts.bcc}`)
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`)
  if (opts.references) lines.push(`References: ${opts.references}`)
  lines.push('MIME-Version: 1.0')

  const text = opts.bodyText || ''
  const html = opts.bodyHtml?.trim() || ''

  if (html) {
    const boundary = `ab_${Date.now().toString(36)}`
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    lines.push('')
    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/plain; charset="UTF-8"')
    lines.push('Content-Transfer-Encoding: base64')
    lines.push('')
    lines.push(
      Buffer.from(text || html.replace(/<[^>]+>/g, ' '), 'utf8').toString(
        'base64'
      )
    )
    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/html; charset="UTF-8"')
    lines.push('Content-Transfer-Encoding: base64')
    lines.push('')
    lines.push(Buffer.from(html, 'utf8').toString('base64'))
    lines.push(`--${boundary}--`)
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"')
    lines.push('Content-Transfer-Encoding: base64')
    lines.push('')
    lines.push(Buffer.from(text, 'utf8').toString('base64'))
  }

  return lines.join('\r\n')
}

/**
 * Send a message via the authenticated user's Gmail.
 * Requires gmail.send scope — users who linked before this scope must re-consent.
 */
export async function sendGmailMessage(
  userId: string,
  opts: {
    to: string
    subject: string
    bodyText?: string
    bodyHtml?: string
    cc?: string
    bcc?: string
    threadId?: string
    inReplyTo?: string
    references?: string
    /** Linked Workspace / Gmail account to send from (multi-account). */
    accountEmail?: string | null
  }
): Promise<{ id: string; threadId?: string; labelIds?: string[] }> {
  const to = opts.to.trim()
  if (!to) throw new Error('يلزم عنوان المستلم (to).')
  const subject = String(opts.subject ?? '').trim()
  if (!subject) throw new Error('يلزم موضوع الرسالة (subject).')
  const bodyText = String(opts.bodyText ?? '').trim()
  const bodyHtml = opts.bodyHtml ? String(opts.bodyHtml).trim() : ''
  if (!bodyText && !bodyHtml) {
    throw new Error('يلزم نص الرسالة (bodyText أو bodyHtml).')
  }

  const raw = toBase64Url(
    buildRawMime({
      to,
      subject,
      bodyText,
      bodyHtml: bodyHtml || undefined,
      cc: opts.cc?.trim() || undefined,
      bcc: opts.bcc?.trim() || undefined,
      inReplyTo: opts.inReplyTo?.trim() || undefined,
      references: opts.references?.trim() || undefined,
    })
  )

  const payload: { raw: string; threadId?: string } = { raw }
  if (opts.threadId?.trim()) payload.threadId = opts.threadId.trim()

  const res = await gmailFetch(userId, '/users/me/messages/send', {
    method: 'POST',
    body: JSON.stringify(payload),
    accountEmail: opts.accountEmail || null,
  })
  const data = (await res.json()) as {
    id?: string
    threadId?: string
    labelIds?: string[]
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message ||
        `Gmail send HTTP ${res.status} — أعد ربط Google بصلاحية gmail.send`
    )
  }
  if (!data.id) throw new Error('فشل إرسال البريد: لم يُرجع Gmail معرّفاً.')

  return {
    id: data.id,
    threadId: data.threadId,
    labelIds: data.labelIds,
  }
}

/** Reply in-thread to an existing message. */
export async function replyGmailMessage(
  userId: string,
  opts: {
    messageId: string
    bodyText?: string
    bodyHtml?: string
    replyAll?: boolean
    subject?: string
    accountEmail?: string | null
  }
) {
  const original = await readGmailMessage(userId, opts.messageId, {
    accountEmail: opts.accountEmail,
  })
  const fromMatch = original.from.match(/<([^>]+)>/) || [null, original.from]
  const replyTo = (fromMatch[1] || original.from).trim()
  if (!replyTo) throw new Error('تعذّر استخراج عنوان المرسل للرد.')

  let to = replyTo
  let cc = original.cc
  if (opts.replyAll) {
    const others = original.to
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    // Keep To as original from; put other recipients on Cc when reply-all.
    if (others.length) {
      const ccSet = new Set(
        [...(cc ? cc.split(',') : []), ...others]
          .map((s) => s.trim())
          .filter(Boolean)
      )
      cc = [...ccSet].join(', ')
    }
  }

  const subject =
    opts.subject?.trim() ||
    (original.subject?.match(/^re:/i)
      ? original.subject
      : `Re: ${original.subject || 'بدون موضوع'}`)

  const refs = [original.references, original.messageIdHeader]
    .filter(Boolean)
    .join(' ')
    .trim()

  return sendGmailMessage(userId, {
    to,
    cc: cc || undefined,
    subject,
    bodyText: opts.bodyText,
    bodyHtml: opts.bodyHtml,
    threadId: original.threadId,
    inReplyTo: original.messageIdHeader,
    references: refs || original.messageIdHeader,
    accountEmail: opts.accountEmail,
  })
}

/** Profile email for the linked Gmail account. */
export async function getGmailProfile(
  userId: string,
  opts?: { accountEmail?: string | null }
): Promise<{ emailAddress: string; messagesTotal?: number; threadsTotal?: number }> {
  const res = await gmailFetch(userId, '/users/me/profile', {
    accountEmail: opts?.accountEmail || null,
  })
  const data = (await res.json()) as {
    emailAddress?: string
    messagesTotal?: number
    threadsTotal?: number
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(data.error?.message || `Gmail profile HTTP ${res.status}`)
  }
  return {
    emailAddress: data.emailAddress || '',
    messagesTotal: data.messagesTotal,
    threadsTotal: data.threadsTotal,
  }
}
