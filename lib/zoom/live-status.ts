/**
 * Detect currently live Zoom meetings (account S2S OAuth).
 * Also correlates with room calendar Zoom links.
 */
import { isZoomCreateConfigured } from '@/lib/zoom/create-meeting'
import { listRoomCalendarEvents } from '@/lib/rooms/room-calendar'

export type LiveZoomMeeting = {
  id: string
  topic: string
  joinUrl?: string | null
  hostEmail?: string | null
  startTime?: string | null
  durationMinutes?: number | null
  participants?: number | null
  source: 'zoom_live' | 'zoom_status' | 'calendar_window'
  live: boolean
  statusAr: string
}

async function getZoomAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID?.trim()
  const clientId = process.env.ZOOM_CLIENT_ID?.trim()
  const clientSecret = process.env.ZOOM_CLIENT_SECRET?.trim()
  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Zoom غير مضبوط')
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
  const data = (await res.json()) as {
    access_token?: string
    reason?: string
    error?: string
  }
  if (!res.ok || !data.access_token) {
    throw new Error(data.reason || data.error || `Zoom token HTTP ${res.status}`)
  }
  return data.access_token
}

function extractZoomMeetingId(text: string): string | null {
  const m =
    text.match(/zoom\.us\/j\/(\d+)/i) ||
    text.match(/zoom\.us\/wc\/join\/(\d+)/i) ||
    text.match(/\/s\/(\d{9,15})/i) ||
    text.match(/\b(\d{9,12})\b/)
  return m?.[1] || null
}

async function listZoomUsers(token: string): Promise<Array<{ id: string; email?: string }>> {
  const preferred = process.env.ZOOM_HOST_USER_ID?.trim()
  if (preferred) return [{ id: preferred }]

  const res = await fetch(
    'https://api.zoom.us/v2/users?status=active&page_size=30',
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }
  )
  const data = (await res.json()) as {
    users?: Array<{ id?: string; email?: string }>
    message?: string
  }
  if (!res.ok) {
    // Fall back to "me" (works on some account configs)
    return [{ id: 'me' }]
  }
  const users = (data.users || [])
    .map((u) => ({ id: String(u.id || ''), email: u.email }))
    .filter((u) => u.id)
  return users.length ? users.slice(0, 20) : [{ id: 'me' }]
}

async function liveMeetingsForUser(
  token: string,
  userId: string,
  hostEmail?: string
): Promise<LiveZoomMeeting[]> {
  const res = await fetch(
    `https://api.zoom.us/v2/users/${encodeURIComponent(userId)}/meetings?type=live&page_size=30`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }
  )
  const data = (await res.json()) as {
    meetings?: Array<{
      id?: number | string
      topic?: string
      join_url?: string
      start_time?: string
      duration?: number
    }>
    message?: string
  }
  if (!res.ok) return []
  return (data.meetings || []).map((m) => ({
    id: String(m.id ?? ''),
    topic: m.topic || 'اجتماع Zoom',
    joinUrl: m.join_url || null,
    hostEmail: hostEmail || null,
    startTime: m.start_time || null,
    durationMinutes: m.duration ?? null,
    participants: null,
    source: 'zoom_live' as const,
    live: true,
    statusAr: 'مباشر الآن',
  }))
}

/** Dashboard metrics (needs dashboard scopes; best-effort). */
async function liveFromMetrics(token: string): Promise<LiveZoomMeeting[]> {
  const now = new Date()
  const from = new Date(now.getTime() - 12 * 3600_000).toISOString().slice(0, 10)
  const to = now.toISOString().slice(0, 10)
  const res = await fetch(
    `https://api.zoom.us/v2/metrics/meetings?type=live&from=${from}&to=${to}&page_size=30`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!res.ok) return []
  const data = (await res.json()) as {
    meetings?: Array<{
      id?: string
      topic?: string
      host?: string
      email?: string
      start_time?: string
      participants?: number
      join_url?: string
    }>
  }
  return (data.meetings || []).map((m) => ({
    id: String(m.id || ''),
    topic: m.topic || 'اجتماع Zoom',
    joinUrl: m.join_url || null,
    hostEmail: m.email || m.host || null,
    startTime: m.start_time || null,
    durationMinutes: null,
    participants: typeof m.participants === 'number' ? m.participants : null,
    source: 'zoom_live' as const,
    live: true,
    statusAr: 'مباشر الآن',
  }))
}

async function statusForMeetingIds(
  token: string,
  ids: string[]
): Promise<LiveZoomMeeting[]> {
  const out: LiveZoomMeeting[] = []
  for (const id of ids.slice(0, 12)) {
    try {
      const res = await fetch(
        `https://api.zoom.us/v2/meetings/${encodeURIComponent(id)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        }
      )
      if (!res.ok) continue
      const data = (await res.json()) as {
        id?: number | string
        topic?: string
        join_url?: string
        status?: string
        start_time?: string
        duration?: number
      }
      const status = String(data.status || '').toLowerCase()
      const live = status === 'started' || status === 'waiting'
      out.push({
        id: String(data.id ?? id),
        topic: data.topic || `اجتماع ${id}`,
        joinUrl: data.join_url || null,
        hostEmail: null,
        startTime: data.start_time || null,
        durationMinutes: data.duration ?? null,
        participants: null,
        source: 'zoom_status',
        live,
        statusAr:
          status === 'started'
            ? 'مباشر الآن'
            : status === 'waiting'
              ? 'بانتظار المضيف'
              : status === 'finished'
                ? 'انتهى'
                : status || 'غير معروف',
      })
    } catch {
      /* skip */
    }
  }
  return out
}

function calendarWindowMeetings(
  events: Awaited<ReturnType<typeof listRoomCalendarEvents>>
): LiveZoomMeeting[] {
  const now = Date.now()
  const out: LiveZoomMeeting[] = []
  for (const ev of events) {
    if (ev.status === 'cancelled') continue
    const start = new Date(ev.startsAt).getTime()
    const end = new Date(ev.endsAt).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    // Within the scheduled window (±5 min grace)
    if (now < start - 5 * 60_000 || now > end + 5 * 60_000) continue
    const blob = [
      ev.descriptionAr || '',
      ev.locationAr || '',
      JSON.stringify(ev.meta || {}),
      ev.titleAr,
    ].join(' ')
    if (!/zoom\.us/i.test(blob) && !ev.meta?.zoomUrl && !ev.meta?.joinUrl) {
      continue
    }
    const joinUrl =
      String(ev.meta?.zoomUrl || ev.meta?.joinUrl || '') ||
      blob.match(/https?:\/\/[^\s]*zoom\.us[^\s]*/i)?.[0] ||
      null
    const id = joinUrl ? extractZoomMeetingId(joinUrl) : null
    const inWindow = now >= start && now <= end
    out.push({
      id: id || ev.id,
      topic: ev.titleAr,
      joinUrl,
      hostEmail: null,
      startTime: ev.startsAt,
      durationMinutes: Math.round((end - start) / 60_000),
      participants: null,
      source: 'calendar_window',
      live: inWindow,
      statusAr: inWindow
        ? 'ضمن وقت الموعد (تحقق من Zoom إن كان مباشراً)'
        : 'قرب موعد Zoom',
    })
  }
  return out
}

export async function getLiveZoomSnapshot(opts?: {
  scopeId?: string
}): Promise<{
  configured: boolean
  liveCount: number
  meetings: LiveZoomMeeting[]
  checkedAt: string
  messageAr: string
  warning?: string
}> {
  const scopeId = opts?.scopeId || 'shared-demo'
  const roomEvents = await listRoomCalendarEvents({
    scopeId,
    from: new Date(Date.now() - 2 * 3600_000).toISOString(),
    to: new Date(Date.now() + 6 * 3600_000).toISOString(),
  }).catch(() => [])

  const calendarHint = calendarWindowMeetings(roomEvents)

  if (!isZoomCreateConfigured()) {
    return {
      configured: false,
      liveCount: calendarHint.filter((m) => m.live).length,
      meetings: calendarHint,
      checkedAt: new Date().toISOString(),
      messageAr:
        calendarHint.length > 0
          ? 'Zoom API غير مضبوط — عرض مواعيد الغرفة التي فيها رابط Zoom فقط.'
          : 'Zoom غير مضبوط. أضف مفاتيح Zoom على Netlify لمعرفة الجلسات المباشرة.',
      warning: 'missing_zoom_env',
    }
  }

  try {
    const token = await getZoomAccessToken()
    const byId = new Map<string, LiveZoomMeeting>()

    const metrics = await liveFromMetrics(token)
    for (const m of metrics) if (m.id) byId.set(m.id, m)

    const users = await listZoomUsers(token)
    for (const u of users) {
      const lives = await liveMeetingsForUser(token, u.id, u.email)
      for (const m of lives) if (m.id) byId.set(m.id, m)
    }

    const calendarIds = calendarHint
      .map((m) => extractZoomMeetingId(m.joinUrl || m.id) || '')
      .filter(Boolean)
    const statuses = await statusForMeetingIds(token, calendarIds)
    for (const m of statuses) {
      if (!m.id) continue
      const prev = byId.get(m.id)
      if (!prev || m.live)
        byId.set(m.id, {
          ...prev,
          ...m,
          live: Boolean(m.live || prev?.live),
        })
    }

    // Keep calendar hints that aren't already confirmed
    for (const m of calendarHint) {
      const key = extractZoomMeetingId(m.joinUrl || '') || m.id
      if (!byId.has(key)) byId.set(key, m)
    }

    const meetings = [...byId.values()].sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1
      return (a.topic || '').localeCompare(b.topic || '', 'ar')
    })
    const confirmedLive = meetings.filter(
      (m) => m.live && m.source !== 'calendar_window'
    )
    const liveCount =
      confirmedLive.length > 0
        ? confirmedLive.length
        : meetings.filter((m) => m.live).length

    return {
      configured: true,
      liveCount,
      meetings,
      checkedAt: new Date().toISOString(),
      messageAr:
        confirmedLive.length > 0
          ? `${confirmedLive.length} جلسة Zoom مباشرة الآن.`
          : meetings.some((m) => m.live)
            ? 'لا تأكيد مباشر من Zoom — توجد مواعيد غرفة ضمن الوقت الحالي برابط Zoom.'
            : 'لا جلسات Zoom مباشرة الآن.',
    }
  } catch (e) {
    return {
      configured: true,
      liveCount: calendarHint.filter((m) => m.live).length,
      meetings: calendarHint,
      checkedAt: new Date().toISOString(),
      messageAr: 'تعذّر الاتصال بـ Zoom API — عُرضت مواعيد الغرفة فقط.',
      warning: e instanceof Error ? e.message : 'zoom_error',
    }
  }
}
