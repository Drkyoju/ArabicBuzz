/**
 * Upcoming Zoom meetings: Zoom API (scheduled) + room calendar events with Zoom links.
 * Team SoT for agenda remains room_calendar_*; Zoom API adds account-scheduled meetings.
 */
import { isZoomCreateConfigured } from '@/lib/zoom/create-meeting'
import { listRoomCalendarEvents } from '@/lib/rooms/room-calendar'
import { teamCalendarScopeId } from '@/lib/scopes/team-calendar-scope'

export type UpcomingZoomMeeting = {
  id: string
  topic: string
  startTime: string | null
  endTime?: string | null
  durationMinutes?: number | null
  joinUrl?: string | null
  hostEmail?: string | null
  source: 'zoom_api' | 'room_calendar'
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
    text.match(/\/s\/(\d{9,15})/i)
  return m?.[1] || null
}

function eventHasZoom(
  ev: Awaited<ReturnType<typeof listRoomCalendarEvents>>[number]
): boolean {
  const blob = [
    ev.descriptionAr || '',
    ev.locationAr || '',
    JSON.stringify(ev.meta || {}),
    ev.titleAr,
  ].join(' ')
  return (
    /zoom\.us/i.test(blob) ||
    Boolean(ev.meta?.zoomUrl) ||
    Boolean(ev.meta?.joinUrl)
  )
}

function joinUrlFromEvent(
  ev: Awaited<ReturnType<typeof listRoomCalendarEvents>>[number]
): string | null {
  const metaUrl = String(ev.meta?.zoomUrl || ev.meta?.joinUrl || '').trim()
  if (metaUrl) return metaUrl
  const blob = `${ev.descriptionAr || ''} ${ev.locationAr || ''}`
  return blob.match(/https?:\/\/[^\s]*zoom\.us[^\s]*/i)?.[0] || null
}

async function listZoomUsers(
  token: string
): Promise<Array<{ id: string; email?: string }>> {
  const preferred = process.env.ZOOM_HOST_USER_ID?.trim()
  if (preferred) return [{ id: preferred }]

  const res = await fetch(
    'https://api.zoom.us/v2/users?status=active&page_size=30',
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!res.ok) return [{ id: 'me' }]
  const data = (await res.json()) as {
    users?: Array<{ id?: string; email?: string }>
  }
  const users = (data.users || [])
    .map((u) => ({ id: String(u.id || ''), email: u.email }))
    .filter((u) => u.id)
  return users.length ? users.slice(0, 10) : [{ id: 'me' }]
}

async function upcomingFromZoomApi(): Promise<UpcomingZoomMeeting[]> {
  if (!isZoomCreateConfigured()) return []
  const token = await getZoomAccessToken()
  const users = await listZoomUsers(token)
  const byId = new Map<string, UpcomingZoomMeeting>()
  const now = Date.now()

  for (const u of users) {
    const res = await fetch(
      `https://api.zoom.us/v2/users/${encodeURIComponent(u.id)}/meetings?type=upcoming&page_size=30`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!res.ok) continue
    const data = (await res.json()) as {
      meetings?: Array<{
        id?: number | string
        topic?: string
        start_time?: string
        duration?: number
        join_url?: string
      }>
    }
    for (const m of data.meetings || []) {
      const id = String(m.id || '')
      if (!id) continue
      const start = m.start_time ? new Date(m.start_time).getTime() : NaN
      if (Number.isFinite(start) && start < now - 30 * 60_000) continue
      byId.set(id, {
        id,
        topic: m.topic || 'اجتماع Zoom',
        startTime: m.start_time || null,
        durationMinutes: m.duration ?? null,
        joinUrl: m.join_url || null,
        hostEmail: u.email || null,
        source: 'zoom_api',
        statusAr: 'مجدول في Zoom',
      })
    }
  }
  return [...byId.values()]
}

async function upcomingFromRoomCalendar(
  scopeId: string
): Promise<UpcomingZoomMeeting[]> {
  const from = new Date(Date.now() - 30 * 60_000).toISOString()
  const to = new Date(Date.now() + 30 * 86400_000).toISOString()
  const events = await listRoomCalendarEvents({
    scopeId,
    from,
    to,
    hideTestTitles: true,
  }).catch(() => [])

  return events
    .filter((e) => e.status !== 'cancelled' && eventHasZoom(e))
    .map((e) => {
      const joinUrl = joinUrlFromEvent(e)
      const id = extractZoomMeetingId(joinUrl || '') || e.id
      const start = new Date(e.startsAt).getTime()
      const end = new Date(e.endsAt).getTime()
      return {
        id,
        topic: e.titleAr,
        startTime: e.startsAt,
        endTime: e.endsAt,
        durationMinutes:
          Number.isFinite(start) && Number.isFinite(end)
            ? Math.round((end - start) / 60_000)
            : null,
        joinUrl,
        hostEmail: e.createdByAr,
        source: 'room_calendar' as const,
        statusAr: 'من تقويم الفريق',
      }
    })
}

export type UpcomingZoomSnapshot = {
  scopeId: string
  configured: boolean
  count: number
  meetings: UpcomingZoomMeeting[]
  checkedAt: string
  messageAr: string
  warning?: string
}

export async function getUpcomingZoomSnapshot(opts?: {
  scopeId?: string
}): Promise<UpcomingZoomSnapshot> {
  const scopeId = teamCalendarScopeId(opts?.scopeId)
  const configured = isZoomCreateConfigured()

  let fromApi: UpcomingZoomMeeting[] = []
  let warning: string | undefined
  if (configured) {
    try {
      fromApi = await upcomingFromZoomApi()
    } catch (e) {
      warning = e instanceof Error ? e.message : 'zoom_error'
    }
  }

  const fromRoom = await upcomingFromRoomCalendar(scopeId)
  const byKey = new Map<string, UpcomingZoomMeeting>()

  for (const m of fromRoom) {
    const key = m.joinUrl || m.id
    byKey.set(key, m)
  }
  for (const m of fromApi) {
    const key = m.joinUrl || m.id
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, m)
      continue
    }
    // Prefer room topic when same meeting; keep Zoom join URL.
    byKey.set(key, {
      ...prev,
      joinUrl: m.joinUrl || prev.joinUrl,
      hostEmail: m.hostEmail || prev.hostEmail,
      statusAr:
        prev.source === 'room_calendar'
          ? 'في تقويم الفريق + Zoom'
          : m.statusAr,
    })
  }

  const meetings = [...byKey.values()].sort((a, b) => {
    const ta = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER
    const tb = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER
    return ta - tb
  })

  return {
    scopeId,
    configured,
    count: meetings.length,
    meetings: meetings.slice(0, 40),
    checkedAt: new Date().toISOString(),
    messageAr:
      meetings.length === 0
        ? configured
          ? 'لا اجتماعات Zoom قادمة في الحساب أو تقويم الفريق.'
          : 'لا مواعيد Zoom في تقويم الفريق. اربط Zoom من الإعدادات لعرض المجدول في الحساب أيضاً.'
        : `${meetings.length} اجتماع Zoom قادم (تقويم الفريق${configured ? ' + حساب Zoom' : ''}).`,
    warning,
  }
}
