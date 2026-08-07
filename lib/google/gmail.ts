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
}

export type GmailMessageDetail = GmailMessageSummary & {
  bodyText: string
  bodyHtml?: string
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
  body?: { data?: string; size?: number }
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

function toSummary(msg: {
  id?: string
  threadId?: string
  snippet?: string
  labelIds?: string[]
  payload?: {
    headers?: Array<{ name: string; value: string }>
  }
}): GmailMessageSummary {
  const headers = msg.payload?.headers
  return {
    id: String(msg.id || ''),
    threadId: msg.threadId,
    subject: headerOf(headers, 'Subject'),
    from: headerOf(headers, 'From'),
    to: headerOf(headers, 'To'),
    date: headerOf(headers, 'Date') || undefined,
    snippet: String(msg.snippet || ''),
    labelIds: msg.labelIds,
  }
}

/**
 * Search Gmail with a Gmail query string (e.g. `from:x newer_than:7d`).
 * Read-only — does not modify labels or send mail.
 */
export async function searchGmailMessages(
  userId: string,
  opts: { query: string; maxResults?: number; accountEmail?: string | null }
): Promise<GmailMessageSummary[]> {
  const q = opts.query.trim()
  if (!q) throw new Error('يلزم استعلام بحث (query) لـ Gmail.')
  const accountEmail = opts.accountEmail || null

  const listParams = new URLSearchParams({
    q,
    maxResults: String(Math.min(Math.max(opts.maxResults || 10, 1), 25)),
  })
  const listRes = await gmailFetch(userId, `/users/me/messages?${listParams}`, {
    accountEmail,
  })
  const listData = (await listRes.json()) as {
    messages?: Array<{ id: string }>
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
    const msg = (await msgRes.json()) as Parameters<typeof toSummary>[0]
    out.push(toSummary({ ...msg, id: msg.id || m.id }))
  }
  return out
}

/** Read one Gmail message body (plain text preferred). */
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
  }
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
}): string {
  const lines: string[] = [
    `To: ${opts.to}`,
    `Subject: ${encodeHeaderUtf8(opts.subject)}`,
  ]
  if (opts.cc) lines.push(`Cc: ${opts.cc}`)
  if (opts.bcc) lines.push(`Bcc: ${opts.bcc}`)
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
    lines.push(Buffer.from(text || html.replace(/<[^>]+>/g, ' '), 'utf8').toString('base64'))
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
    })
  )

  const res = await gmailFetch(userId, '/users/me/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw }),
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
