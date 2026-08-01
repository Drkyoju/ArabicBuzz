import { getValidGoogleAccessToken } from '@/lib/google/tokens'

const CAL_BASE = 'https://www.googleapis.com/calendar/v3'
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1'

export type CalendarEventInput = {
  summary: string
  description?: string
  location?: string
  startIso: string
  endIso: string
  timeZone?: string
  /** Zoom / Meet link */
  conferenceUrl?: string
  attendeeEmails?: string[]
  /** Minutes before start for email + popup reminders */
  reminderMinutes?: number[]
}

export type CalendarEventSummary = {
  id: string
  summary: string
  description?: string
  location?: string
  start?: string
  end?: string
  htmlLink?: string
  hangoutLink?: string
  status?: string
}

async function googleFetch(
  userId: string,
  url: string,
  init?: RequestInit
): Promise<Response> {
  const tok = await getValidGoogleAccessToken(userId)
  if (!tok.ok) throw new Error(tok.error)
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${tok.accessToken}`)
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(url, { ...init, headers })
}

function toEventBody(input: CalendarEventInput) {
  const tz = input.timeZone || 'Asia/Riyadh'
  const descParts = [input.description || '']
  if (input.conferenceUrl) {
    descParts.push(`رابط الاجتماع: ${input.conferenceUrl}`)
  }
  const reminders = input.reminderMinutes?.length
    ? {
        useDefault: false,
        overrides: input.reminderMinutes.flatMap((m) => [
          { method: 'popup' as const, minutes: m },
          { method: 'email' as const, minutes: m },
        ]),
      }
    : {
        useDefault: false,
        overrides: [
          { method: 'popup' as const, minutes: 30 },
          { method: 'email' as const, minutes: 60 },
        ],
      }

  return {
    summary: input.summary,
    description: descParts.filter(Boolean).join('\n\n'),
    location: input.location || input.conferenceUrl || undefined,
    start: { dateTime: input.startIso, timeZone: tz },
    end: { dateTime: input.endIso, timeZone: tz },
    attendees: input.attendeeEmails?.map((email) => ({ email })),
    reminders,
    source: input.conferenceUrl
      ? { title: 'Zoom / اجتماع', url: input.conferenceUrl }
      : undefined,
  }
}

function mapEvent(e: Record<string, unknown>): CalendarEventSummary {
  const start = e.start as { dateTime?: string; date?: string } | undefined
  const end = e.end as { dateTime?: string; date?: string } | undefined
  return {
    id: String(e.id || ''),
    summary: String(e.summary || '(بدون عنوان)'),
    description: e.description ? String(e.description) : undefined,
    location: e.location ? String(e.location) : undefined,
    start: start?.dateTime || start?.date,
    end: end?.dateTime || end?.date,
    htmlLink: e.htmlLink ? String(e.htmlLink) : undefined,
    hangoutLink: e.hangoutLink ? String(e.hangoutLink) : undefined,
    status: e.status ? String(e.status) : undefined,
  }
}

export async function listUpcomingEvents(
  userId: string,
  opts?: { maxResults?: number; query?: string }
): Promise<CalendarEventSummary[]> {
  const params = new URLSearchParams({
    calendarId: 'primary',
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: new Date().toISOString(),
    maxResults: String(opts?.maxResults || 15),
  })
  if (opts?.query) params.set('q', opts.query)
  const res = await googleFetch(
    userId,
    `${CAL_BASE}/calendars/primary/events?${params}`
  )
  const data = (await res.json()) as {
    items?: Record<string, unknown>[]
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(data.error?.message || `Calendar list HTTP ${res.status}`)
  }
  return (data.items || []).map(mapEvent)
}

export async function createCalendarEvent(
  userId: string,
  input: CalendarEventInput
): Promise<CalendarEventSummary> {
  const res = await googleFetch(
    userId,
    `${CAL_BASE}/calendars/primary/events?sendUpdates=all`,
    { method: 'POST', body: JSON.stringify(toEventBody(input)) }
  )
  const data = (await res.json()) as Record<string, unknown> & {
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(data.error?.message || `Calendar create HTTP ${res.status}`)
  }
  return mapEvent(data)
}

export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  patch: Partial<CalendarEventInput>
): Promise<CalendarEventSummary> {
  const getRes = await googleFetch(
    userId,
    `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`
  )
  const existing = (await getRes.json()) as Record<string, unknown> & {
    error?: { message?: string }
  }
  if (!getRes.ok) {
    throw new Error(
      existing.error?.message || `Calendar get HTTP ${getRes.status}`
    )
  }

  const start =
    (existing.start as { dateTime?: string; timeZone?: string }) || {}
  const end = (existing.end as { dateTime?: string; timeZone?: string }) || {}
  const merged = toEventBody({
    summary: patch.summary || String(existing.summary || 'موعد'),
    description:
      patch.description ??
      (existing.description ? String(existing.description) : undefined),
    location:
      patch.location ??
      (existing.location ? String(existing.location) : undefined),
    startIso: patch.startIso || start.dateTime || new Date().toISOString(),
    endIso:
      patch.endIso ||
      end.dateTime ||
      new Date(Date.now() + 3600_000).toISOString(),
    timeZone: patch.timeZone || start.timeZone || 'Asia/Riyadh',
    conferenceUrl: patch.conferenceUrl,
    attendeeEmails: patch.attendeeEmails,
    reminderMinutes: patch.reminderMinutes,
  })

  const res = await googleFetch(
    userId,
    `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: 'PUT', body: JSON.stringify({ ...existing, ...merged }) }
  )
  const data = (await res.json()) as Record<string, unknown> & {
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(data.error?.message || `Calendar update HTTP ${res.status}`)
  }
  return mapEvent(data)
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string
): Promise<{ deleted: true; eventId: string }> {
  const res = await googleFetch(
    userId,
    `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: 'DELETE' }
  )
  if (!res.ok && res.status !== 204) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    throw new Error(data.error?.message || `Calendar delete HTTP ${res.status}`)
  }
  return { deleted: true, eventId }
}

/**
 * Scan recent Gmail for Zoom / calendar invite threads and surface links + times.
 * Does not auto-write Calendar — agent/tools create events after review.
 */
export async function scanEmailForMeetings(
  userId: string,
  opts?: { maxResults?: number }
): Promise<
  Array<{
    id: string
    subject: string
    from: string
    snippet: string
    zoomUrl?: string
    dateHint?: string
  }>
> {
  const q = [
    'newer_than:21d',
    '(zoom.us OR "google meet" OR meet.google.com OR invitation OR دعوة OR اجتماع OR webinar)',
  ].join(' ')
  const listParams = new URLSearchParams({
    q,
    maxResults: String(opts?.maxResults || 12),
  })
  const listRes = await googleFetch(
    userId,
    `${GMAIL_BASE}/users/me/messages?${listParams}`
  )
  const listData = (await listRes.json()) as {
    messages?: Array<{ id: string }>
    error?: { message?: string }
  }
  if (!listRes.ok) {
    throw new Error(
      listData.error?.message ||
        `Gmail list HTTP ${listRes.status} — أعد الربط بصلاحية قراءة البريد`
    )
  }

  const out: Array<{
    id: string
    subject: string
    from: string
    snippet: string
    zoomUrl?: string
    dateHint?: string
  }> = []

  for (const m of listData.messages || []) {
    const msgRes = await googleFetch(
      userId,
      `${GMAIL_BASE}/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
    )
    if (!msgRes.ok) continue
    const msg = (await msgRes.json()) as {
      id?: string
      snippet?: string
      payload?: { headers?: Array<{ name: string; value: string }> }
    }
    const headers = msg.payload?.headers || []
    const subject =
      headers.find((h) => h.name.toLowerCase() === 'subject')?.value || ''
    const from =
      headers.find((h) => h.name.toLowerCase() === 'from')?.value || ''
    const dateHint =
      headers.find((h) => h.name.toLowerCase() === 'date')?.value || undefined
    const snippet = String(msg.snippet || '')
    const zoomMatch = `${subject} ${snippet}`.match(
      /https?:\/\/[\w.-]*zoom\.us\/[^\s<>"']+/i
    )
    const meetMatch = `${subject} ${snippet}`.match(
      /https?:\/\/meet\.google\.com\/[^\s<>"']+/i
    )
    out.push({
      id: String(msg.id || m.id),
      subject,
      from,
      snippet,
      zoomUrl: zoomMatch?.[0] || meetMatch?.[0],
      dateHint,
    })
  }
  return out
}

/** Detect Zoom / Meet URLs in free text (chat). */
export function extractConferenceUrl(text: string): string | undefined {
  const zoom = text.match(/https?:\/\/[\w.-]*zoom\.us\/[^\s<>"']+/i)
  if (zoom) return zoom[0]
  const meet = text.match(/https?:\/\/meet\.google\.com\/[^\s<>"']+/i)
  if (meet) return meet[0]
  return undefined
}
