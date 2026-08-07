import nodemailer from 'nodemailer'
import {
  getMailboxCreds,
  getMessageById,
  markSeen,
} from '@/lib/email/imap-store'

/** RFC 2047 for Arabic subjects. */
function encodeHeaderUtf8(value: string): string {
  if (!/[^\x00-\x7F]/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function extractEmail(fromAddr: string): string {
  const m = fromAddr.match(/<([^>]+)>/)
  if (m?.[1]) return m[1].trim()
  return fromAddr.trim()
}

function replySubject(subject: string): string {
  const s = subject.trim() || '(بدون موضوع)'
  if (/^(re|رد|回复)\s*:/i.test(s)) return s
  return `Re: ${s}`
}

export type SendMailInput = {
  to: string
  subject: string
  bodyText?: string
  bodyHtml?: string
  cc?: string
  bcc?: string
  /** Reply to a stored imap_messages.id */
  replyToMessageId?: string
  /** Include original From in To (reply-all style when cc also set). */
  replyAll?: boolean
}

export type SendMailResult = {
  ok: boolean
  messageId?: string
  to: string
  subject: string
  messageAr: string
}

export async function sendSmtpMail(
  input: SendMailInput
): Promise<SendMailResult> {
  const creds = await getMailboxCreds()
  if (!creds) {
    throw new Error(
      'بريد SMTP غير مضبوط — احفظ إعدادات IMAP/SMTP من الإعدادات → بريد الجمعية.'
    )
  }

  let to = input.to.trim()
  let subject = input.subject.trim()
  let bodyText = String(input.bodyText ?? '').trim()
  let bodyHtml = input.bodyHtml ? String(input.bodyHtml).trim() : ''
  let cc = input.cc?.trim() || undefined
  const bcc = input.bcc?.trim() || undefined
  const headers: Record<string, string> = {}

  if (input.replyToMessageId) {
    const orig = await getMessageById(input.replyToMessageId)
    if (!orig) {
      throw new Error('رسالة الرد غير موجودة في الوارد المحلي — زامن البريد أولاً.')
    }
    const replyTo = extractEmail(orig.from_addr)
    if (!to) to = replyTo
    if (!subject) subject = replySubject(orig.subject)
    if (input.replyAll) {
      const extras = [orig.to_addr, orig.cc_addr]
        .join(',')
        .split(',')
        .map((s) => s.trim())
        .map(extractEmail)
        .filter(
          (e) =>
            e &&
            e.toLowerCase() !== creds.emailAddress.toLowerCase() &&
            e.toLowerCase() !== to.toLowerCase()
        )
      if (extras.length) {
        cc = [...new Set([...(cc ? cc.split(',') : []), ...extras])].join(', ')
      }
    }
    if (orig.message_id) {
      headers['In-Reply-To'] = orig.message_id
      const refs = [orig.references_hdr, orig.message_id]
        .filter(Boolean)
        .join(' ')
        .trim()
      if (refs) headers.References = refs
    }
    if (!bodyText && !bodyHtml) {
      throw new Error('يلزم نص الرد (bodyText أو bodyHtml).')
    }
    // Quote original at bottom for plain replies
    if (bodyText && orig.body_text) {
      const quote = orig.body_text
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')
        .slice(0, 4000)
      bodyText = `${bodyText}\n\n---\n${quote}`
    }
    await markSeen(orig.id, true).catch(() => null)
  }

  if (!to) throw new Error('يلزم عنوان المستلم (to).')
  if (!subject) throw new Error('يلزم موضوع الرسالة (subject).')
  if (!bodyText && !bodyHtml) {
    throw new Error('يلزم نص الرسالة (bodyText أو bodyHtml).')
  }

  const transporter = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: creds.smtpSecure,
    auth: {
      user: creds.username,
      pass: creds.password,
    },
  })

  const info = await transporter.sendMail({
    from: `"${creds.emailAddress}" <${creds.emailAddress}>`,
    to,
    cc,
    bcc,
    subject: encodeHeaderUtf8(subject),
    text: bodyText || undefined,
    html: bodyHtml || undefined,
    headers,
  })

  return {
    ok: true,
    messageId: info.messageId,
    to,
    subject,
    messageAr: `أُرسل البريد عبر SMTP إلى ${to} — الموضوع: ${subject}`,
  }
}

export async function testSmtpConnection(): Promise<{
  ok: boolean
  messageAr: string
}> {
  const creds = await getMailboxCreds()
  if (!creds) {
    return { ok: false, messageAr: 'لا إعدادات SMTP محفوظة.' }
  }
  try {
    const transporter = nodemailer.createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort,
      secure: creds.smtpSecure,
      auth: {
        user: creds.username,
        pass: creds.password,
      },
    })
    await transporter.verify()
    return { ok: true, messageAr: 'اتصال SMTP ناجح — جاهز للإرسال.' }
  } catch (e) {
    return {
      ok: false,
      messageAr:
        e instanceof Error
          ? `فشل SMTP: ${e.message}`
          : 'فشل التحقق من SMTP.',
    }
  }
}
