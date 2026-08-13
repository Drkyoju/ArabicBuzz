/**
 * Email/ICS invites for shared room calendar events.
 * Prefer association SMTP; fall back to linked owner Gmail; then Resend.
 * Arabic MSA body. Default ON when attendee emails are present.
 */

import { getMailboxCreds } from '@/lib/email/imap-store'

export type RoomCalendarInviteEvent = {
  id: string
  titleAr: string
  descriptionAr?: string | null
  locationAr?: string | null
  startsAt: string
  endsAt: string
  allDay?: boolean
  attendees: string[]
  status?: string
}

export type SendRoomCalendarInvitesResult = {
  ok: boolean
  skipped?: boolean
  channel?: 'smtp' | 'gmail' | 'resend' | 'none'
  sentTo: string[]
  failed: Array<{ email: string; error: string }>
  messageAr: string
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** UTC stamp for ICS DTSTAMP / UID seed. */
function icsUtcStamp(d = new Date()): string {
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    'T' +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    'Z'
  )
}

/** Local Asia/Riyadh wall time → ICS floating with TZID. */
function icsLocalFromIso(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return icsUtcStamp()
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00'
  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`
}

function icsDateOnlyFromIso(iso: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00'
  return `${get('year')}${get('month')}${get('day')}`
}

function escapeIcsText(s: string): string {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function foldIcsLine(line: string): string {
  if (line.length <= 74) return line
  const chunks: string[] = []
  let rest = line
  chunks.push(rest.slice(0, 74))
  rest = rest.slice(74)
  while (rest.length) {
    chunks.push(` ${rest.slice(0, 73)}`)
    rest = rest.slice(73)
  }
  return chunks.join('\r\n')
}

export function buildRoomCalendarInviteIcs(opts: {
  event: RoomCalendarInviteEvent
  organizerEmail: string
  organizerNameAr?: string
  method?: 'REQUEST' | 'CANCEL'
}): string {
  const method = opts.method || 'REQUEST'
  const ev = opts.event
  const uid = `room-cal-${ev.id}@arabicbuzz`
  const stamp = icsUtcStamp()
  const org = opts.organizerEmail.trim()
  const orgCn = escapeIcsText(opts.organizerNameAr || 'جمعية الهدى والحكمة')
  const summary = escapeIcsText(ev.titleAr || 'موعد')
  const desc = escapeIcsText(
    [ev.descriptionAr || '', 'دعوة من تقويم الغرفة المشترك — ArabicBuzz']
      .filter(Boolean)
      .join('\n')
  )
  const loc = escapeIcsText(ev.locationAr || '')
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ArabicBuzz//Room Calendar//AR',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
  ]
  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${icsDateOnlyFromIso(ev.startsAt)}`)
    lines.push(`DTEND;VALUE=DATE:${icsDateOnlyFromIso(ev.endsAt)}`)
  } else {
    lines.push(`DTSTART;TZID=Asia/Riyadh:${icsLocalFromIso(ev.startsAt)}`)
    lines.push(`DTEND;TZID=Asia/Riyadh:${icsLocalFromIso(ev.endsAt)}`)
  }
  lines.push(`SUMMARY:${summary}`)
  if (desc) lines.push(`DESCRIPTION:${desc}`)
  if (loc) lines.push(`LOCATION:${loc}`)
  lines.push(`ORGANIZER;CN=${orgCn}:mailto:${org}`)
  for (const email of ev.attendees) {
    const e = String(email || '')
      .trim()
      .toLowerCase()
    if (!e.includes('@')) continue
    lines.push(`ATTENDEE;RSVP=TRUE;ROLE=REQ-PARTICIPANT:mailto:${e}`)
  }
  lines.push(
    method === 'CANCEL' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR'
  )
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

function formatWhenAr(ev: RoomCalendarInviteEvent): string {
  try {
    if (ev.allDay) {
      return new Date(ev.startsAt).toLocaleDateString('ar-SA', {
        timeZone: 'Asia/Riyadh',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    }
    const start = new Date(ev.startsAt).toLocaleString('ar-SA', {
      timeZone: 'Asia/Riyadh',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const end = new Date(ev.endsAt).toLocaleTimeString('ar-SA', {
      timeZone: 'Asia/Riyadh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return `${start} – ${end} (توقيت السعودية)`
  } catch {
    return `${ev.startsAt} – ${ev.endsAt}`
  }
}

function inviteBodyAr(ev: RoomCalendarInviteEvent): string {
  const lines = [
    'السلام عليكم،',
    '',
    `ندعوكم لحضور: ${ev.titleAr}`,
    `الوقت: ${formatWhenAr(ev)}`,
  ]
  if (ev.locationAr) lines.push(`المكان: ${ev.locationAr}`)
  if (ev.descriptionAr) {
    lines.push('', String(ev.descriptionAr).trim().slice(0, 1200))
  }
  lines.push(
    '',
    'مرفق ملف التقويم (ICS) لإضافته إلى تقويمكم.',
    '',
    '— جمعية الهدى والحكمة · تقويم الغرفة المشترك (ArabicBuzz)'
  )
  return lines.join('\n')
}

/** True unless explicitly disabled (false / 0 / off / no). Default ON. */
export function shouldSendCalendarEmailInvite(
  flag: unknown,
  attendees: string[]
): boolean {
  if (!attendees.length) return false
  if (flag === undefined || flag === null) return true
  if (typeof flag === 'boolean') return flag
  const v = String(flag)
    .trim()
    .toLowerCase()
  if (v === '' || v === '1' || v === 'true' || v === 'yes' || v === 'on') {
    return true
  }
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return true
}

async function sendViaSmtp(opts: {
  to: string
  subject: string
  bodyText: string
  ics: string
  filename: string
}): Promise<void> {
  const nodemailer = await import('nodemailer')
  const creds = await getMailboxCreds()
  if (!creds) throw new Error('no_smtp')
  const transporter = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: creds.smtpSecure,
    auth: { user: creds.username, pass: creds.password },
  })
  await transporter.sendMail({
    from: `"${creds.emailAddress}" <${creds.emailAddress}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.bodyText,
    attachments: [
      {
        filename: opts.filename,
        content: Buffer.from(opts.ics, 'utf8'),
        contentType: 'text/calendar; method=REQUEST; charset=UTF-8',
      },
    ],
  })
}

async function sendViaGmail(opts: {
  userId: string
  to: string
  subject: string
  bodyText: string
  ics: string
  filename: string
  accountEmail?: string | null
}): Promise<void> {
  const { sendGmailMessageWithAttachments } = await import('@/lib/google/gmail')
  await sendGmailMessageWithAttachments(opts.userId, {
    to: opts.to,
    subject: opts.subject,
    bodyText: opts.bodyText,
    accountEmail: opts.accountEmail,
    attachments: [
      {
        filename: opts.filename,
        content: Buffer.from(opts.ics, 'utf8'),
        mimeType: 'text/calendar; method=REQUEST; charset=UTF-8',
      },
    ],
  })
}

/**
 * Send ICS invites to attendees. Best-effort per recipient.
 * Channel order: association SMTP → owner Gmail → Resend (text+ICS).
 */
export async function sendRoomCalendarEmailInvites(opts: {
  event: RoomCalendarInviteEvent
  /** Acting user (may have Gmail linked). */
  actingUserId?: string
  sendEmailInvite?: unknown
  method?: 'REQUEST' | 'CANCEL'
}): Promise<SendRoomCalendarInvitesResult> {
  const attendees = (opts.event.attendees || [])
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => e.includes('@'))
  if (!shouldSendCalendarEmailInvite(opts.sendEmailInvite, attendees)) {
    return {
      ok: true,
      skipped: true,
      channel: 'none',
      sentTo: [],
      failed: [],
      messageAr: attendees.length
        ? 'لم تُرسل دعوات بريد (مُعطّل).'
        : 'لا مدعوين لإرسال دعوة بريد.',
    }
  }

  const creds = await getMailboxCreds().catch(() => null)
  let organizerEmail = creds?.emailAddress || ''
  let organizerNameAr = 'جمعية الهدى والحكمة'
  let gmailUserId: string | null = null

  if (!organizerEmail) {
    try {
      const { resolveChannelOwnerUserIdAsync } = await import(
        '@/lib/channels/owner-context'
      )
      gmailUserId =
        (await resolveChannelOwnerUserIdAsync(opts.actingUserId)) ||
        opts.actingUserId ||
        null
      if (gmailUserId) {
        const { listGoogleAccounts } = await import('@/lib/google/tokens')
        const accounts = await listGoogleAccounts(gmailUserId)
        organizerEmail = accounts[0]?.email || ''
      }
    } catch {
      /* ignore */
    }
  }
  if (!organizerEmail && opts.actingUserId) {
    try {
      const { listGoogleAccounts } = await import('@/lib/google/tokens')
      const accounts = await listGoogleAccounts(opts.actingUserId)
      if (accounts[0]?.email) {
        organizerEmail = accounts[0].email
        gmailUserId = opts.actingUserId
      }
    } catch {
      /* ignore */
    }
  }
  if (!organizerEmail) {
    organizerEmail =
      process.env.RESEND_FROM?.replace(/^.*<|>$/g, '').trim() ||
      'noreply@arabicbuzz.app'
  }

  const ics = buildRoomCalendarInviteIcs({
    event: opts.event,
    organizerEmail,
    organizerNameAr,
    method: opts.method || 'REQUEST',
  })
  const subject = `دعوة: ${opts.event.titleAr || 'موعد'} — جمعية الهدى والحكمة`
  const bodyText = inviteBodyAr(opts.event)
  const filename = `invite-${opts.event.id.slice(0, 8)}.ics`

  const sentTo: string[] = []
  const failed: Array<{ email: string; error: string }> = []
  let channel: SendRoomCalendarInvitesResult['channel'] = 'none'

  for (const to of attendees) {
    try {
      if (creds) {
        await sendViaSmtp({ to, subject, bodyText, ics, filename })
        channel = 'smtp'
        sentTo.push(to)
        continue
      }
      if (gmailUserId) {
        await sendViaGmail({
          userId: gmailUserId,
          to,
          subject,
          bodyText,
          ics,
          filename,
        })
        channel = 'gmail'
        sentTo.push(to)
        continue
      }
      const { sendResendEmail } = await import('@/lib/email/resend')
      const r = await sendResendEmail({
        to,
        subject,
        text: bodyText,
        attachments: [
          {
            filename,
            contentBase64: Buffer.from(ics, 'utf8').toString('base64'),
          },
        ],
      })
      if (!r.ok) {
        failed.push({
          email: to,
          error: r.error || r.skipped ? 'resend_unavailable' : 'send_failed',
        })
        continue
      }
      channel = 'resend'
      sentTo.push(to)
    } catch (e) {
      failed.push({
        email: to,
        error: e instanceof Error ? e.message : 'send_failed',
      })
    }
  }

  const ok = sentTo.length > 0
  const messageAr = ok
    ? `أُرسلت دعوة بريد/ICS إلى ${sentTo.length} مدعو${failed.length ? ` (فشل ${failed.length})` : ''} عبر ${channel === 'smtp' ? 'بريد الجمعية' : channel === 'gmail' ? 'Gmail' : 'Resend'}.`
    : failed.length
      ? `تعذّر إرسال دعوات البريد: ${failed[0]?.error || 'خطأ'}`
      : 'لم تُرسل دعوات بريد.'

  return { ok, channel, sentTo, failed, messageAr }
}
