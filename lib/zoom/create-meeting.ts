/**
 * Zoom Server-to-Server OAuth — create meetings without pasting links.
 * Env: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
 * Docs: https://developers.zoom.us/docs/internal-apps/create/
 */

export function isZoomCreateConfigured() {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID?.trim() &&
      process.env.ZOOM_CLIENT_ID?.trim() &&
      process.env.ZOOM_CLIENT_SECRET?.trim()
  )
}

async function getZoomAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID?.trim()
  const clientId = process.env.ZOOM_CLIENT_ID?.trim()
  const clientSecret = process.env.ZOOM_CLIENT_SECRET?.trim()
  if (!accountId || !clientId || !clientSecret) {
    throw new Error(
      'Zoom غير مضبوط — أضف ZOOM_ACCOUNT_ID و ZOOM_CLIENT_ID و ZOOM_CLIENT_SECRET على CranL.'
    )
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: AbortSignal.timeout(15_000),
    }
  )
  const data = (await res.json()) as { access_token?: string; reason?: string; error?: string }
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.reason || data.error || `Zoom token HTTP ${res.status}`
    )
  }
  return data.access_token
}

export async function createZoomMeeting(opts: {
  topic: string
  startIso: string
  durationMinutes: number
  agenda?: string
}): Promise<{ joinUrl: string; meetingId: number | string; startUrl?: string }> {
  const token = await getZoomAccessToken()
  const start = new Date(opts.startIso)
  if (!Number.isFinite(start.getTime())) {
    throw new Error('وقت بداية Zoom غير صالح')
  }
  const duration = Math.max(15, Math.round(opts.durationMinutes || 60))
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic: opts.topic.slice(0, 200) || 'اجتماع Arabic Buzz',
      type: 2,
      start_time: start.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      duration,
      timezone: 'Asia/Riyadh',
      agenda: opts.agenda?.slice(0, 2000),
      settings: {
        join_before_host: true,
        waiting_room: false,
        mute_upon_entry: true,
        approval_type: 2,
      },
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json()) as {
    id?: number
    join_url?: string
    start_url?: string
    message?: string
    code?: number
  }
  if (!res.ok || !data.join_url) {
    throw new Error(data.message || `Zoom create HTTP ${res.status}`)
  }
  return {
    joinUrl: data.join_url,
    meetingId: data.id ?? 'unknown',
    startUrl: data.start_url,
  }
}
