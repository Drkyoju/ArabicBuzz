import {
  getValidGoogleAccessToken,
  getValidGoogleAccessTokens,
  listGoogleAccounts,
} from '@/lib/google/tokens'

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
  /** Which linked Google email owns this event. */
  accountEmail?: string
}

export type FreeSlot = {
  startIso: string
  endIso: string
  durationMinutes: number
}

export type AccountBusyBlock = {
  email: string
  start: string
  end: string
}

export type DuplicateKind =
  | 'exact_copy'
  | 'same_title_near_time'
  | 'time_overlap'
  | 'same_conference_link'

export type DuplicateGroup = {
  kind: DuplicateKind
  labelAr: string
  events: CalendarEventSummary[]
}

function normalizeTitle(s: string) {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function eventStartMs(e: CalendarEventSummary) {
  if (!e.start) return NaN
  const t = Date.parse(e.start)
  return Number.isFinite(t) ? t : NaN
}

function eventEndMs(e: CalendarEventSummary) {
  if (!e.end) {
    const s = eventStartMs(e)
    return Number.isFinite(s) ? s + 60 * 60 * 1000 : NaN
  }
  const t = Date.parse(e.end)
  return Number.isFinite(t) ? t : NaN
}

function conferenceKey(e: CalendarEventSummary) {
  const blob = `${e.location || ''} ${e.description || ''} ${e.hangoutLink || ''}`
  const zoom = blob.match(/https?:\/\/[\w.-]*zoom\.us\/[^\s<>"']+/i)
  if (zoom) return zoom[0].replace(/[?#].*$/, '').toLowerCase()
  const meet = blob.match(/https?:\/\/meet\.google\.com\/[^\s<>"']+/i)
  if (meet) return meet[0].replace(/[?#].*$/, '').toLowerCase()
  return ''
}

/**
 * Find replicated / overlapping upcoming appointments.
 * - exact_copy: same title + same start minute
 * - same_title_near_time: same normalized title within ±2h
 * - time_overlap: overlapping time ranges (double-booking)
 * - same_conference_link: same Zoom/Meet URL on different events
 */
export function findDuplicateGroups(
  events: CalendarEventSummary[]
): DuplicateGroup[] {
  const groups: DuplicateGroup[] = []
  const seenPair = new Set<string>()

  const pushGroup = (
    kind: DuplicateKind,
    labelAr: string,
    a: CalendarEventSummary,
    b: CalendarEventSummary
  ) => {
    const key = [kind, a.id, b.id].sort().join('|')
    if (seenPair.has(key)) return
    seenPair.add(key)
    const existing = groups.find(
      (g) =>
        g.kind === kind &&
        g.events.some((e) => e.id === a.id || e.id === b.id)
    )
    if (existing) {
      for (const e of [a, b]) {
        if (!existing.events.some((x) => x.id === e.id)) existing.events.push(e)
      }
      return
    }
    groups.push({ kind, labelAr, events: [a, b] })
  }

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]
      const b = events[j]
      const ta = normalizeTitle(a.summary)
      const tb = normalizeTitle(b.summary)
      const sa = eventStartMs(a)
      const sb = eventStartMs(b)
      const ea = eventEndMs(a)
      const eb = eventEndMs(b)

      if (
        ta &&
        ta === tb &&
        Number.isFinite(sa) &&
        Number.isFinite(sb) &&
        Math.abs(sa - sb) < 60_000
      ) {
        pushGroup(
          'exact_copy',
          'نسخة مكررة بنفس العنوان والوقت',
          a,
          b
        )
        continue
      }

      if (
        ta &&
        ta === tb &&
        Number.isFinite(sa) &&
        Number.isFinite(sb) &&
        Math.abs(sa - sb) <= 2 * 60 * 60 * 1000
      ) {
        pushGroup(
          'same_title_near_time',
          'نفس العنوان بوقت قريب (± ساعتين)',
          a,
          b
        )
      }

      if (
        Number.isFinite(sa) &&
        Number.isFinite(sb) &&
        Number.isFinite(ea) &&
        Number.isFinite(eb) &&
        sa < eb &&
        sb < ea
      ) {
        pushGroup('time_overlap', 'تعارض زمني (حجز مزدوج)', a, b)
      }

      const ca = conferenceKey(a)
      const cb = conferenceKey(b)
      if (ca && ca === cb && a.id !== b.id) {
        pushGroup(
          'same_conference_link',
          'نفس رابط Zoom/Meet على موعدين',
          a,
          b
        )
      }
    }
  }

  return groups
}

export async function findDuplicateAppointments(
  userId: string,
  opts?: { maxResults?: number }
): Promise<{
  eventsScanned: number
  duplicateCount: number
  groups: DuplicateGroup[]
  messageAr: string
}> {
  const events = await listUpcomingEvents(userId, {
    maxResults: opts?.maxResults || 40,
  })
  const groups = findDuplicateGroups(events)
  const duplicateCount = groups.reduce((n, g) => n + g.events.length, 0)
  return {
    eventsScanned: events.length,
    duplicateCount: groups.length,
    groups,
    messageAr:
      groups.length === 0
        ? `لا تكرار ظاهر بين ${events.length} موعداً قادماً.`
        : `تحذير: وُجدت ${groups.length} مجموعة تكرار/تعارض بين ${events.length} موعداً — راجعها قبل إضافة مواعيد جديدة.`,
  }
}

/** Events that would collide with a proposed new appointment. */
export function findConflictsForProposal(
  events: CalendarEventSummary[],
  proposal: { summary: string; startIso: string; endIso: string; conferenceUrl?: string }
): DuplicateGroup[] {
  const phantom: CalendarEventSummary = {
    id: '__proposed__',
    summary: proposal.summary,
    start: proposal.startIso,
    end: proposal.endIso,
    location: proposal.conferenceUrl,
    description: proposal.conferenceUrl,
  }
  return findDuplicateGroups([...events, phantom]).filter((g) =>
    g.events.some((e) => e.id === '__proposed__')
  )
}

async function googleFetch(
  userId: string,
  url: string,
  init?: RequestInit & { accountEmail?: string | null }
): Promise<Response> {
  const tok = await getValidGoogleAccessToken(userId, init?.accountEmail)
  if (!tok.ok) throw new Error(tok.error)
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${tok.accessToken}`)
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const { accountEmail: _a, ...rest } = init || {}
  return fetch(url, { ...rest, headers })
}

function parseScopedEventId(eventId: string): {
  accountEmail?: string
  rawId: string
} {
  const idx = eventId.indexOf('::')
  if (idx > 0 && eventId.includes('@')) {
    return {
      accountEmail: eventId.slice(0, idx).toLowerCase(),
      rawId: eventId.slice(idx + 2),
    }
  }
  return { rawId: eventId }
}

function scopeEventId(email: string | undefined, id: string) {
  if (!email) return id
  return `${email}::${id}`
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

function mapEvent(
  e: Record<string, unknown>,
  accountEmail?: string
): CalendarEventSummary {
  const start = e.start as { dateTime?: string; date?: string } | undefined
  const end = e.end as { dateTime?: string; date?: string } | undefined
  const rawId = String(e.id || '')
  return {
    id: scopeEventId(accountEmail, rawId),
    summary: String(e.summary || '(بدون عنوان)'),
    description: e.description ? String(e.description) : undefined,
    location: e.location ? String(e.location) : undefined,
    start: start?.dateTime || start?.date,
    end: end?.dateTime || end?.date,
    htmlLink: e.htmlLink ? String(e.htmlLink) : undefined,
    hangoutLink: e.hangoutLink ? String(e.hangoutLink) : undefined,
    status: e.status ? String(e.status) : undefined,
    accountEmail,
  }
}

async function listUpcomingForAccount(
  userId: string,
  accountEmail: string,
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
    `${CAL_BASE}/calendars/primary/events?${params}`,
    { accountEmail }
  )
  const data = (await res.json()) as {
    items?: Record<string, unknown>[]
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message ||
        `Calendar list HTTP ${res.status} (${accountEmail})`
    )
  }
  return (data.items || []).map((e) => mapEvent(e, accountEmail))
}

/**
 * List upcoming events from one or all linked Google emails.
 */
export async function listUpcomingEvents(
  userId: string,
  opts?: {
    maxResults?: number
    query?: string
    /** Limit to these emails; default = all linked accounts. */
    emails?: string[]
  }
): Promise<CalendarEventSummary[]> {
  const tokens = await getValidGoogleAccessTokens(userId, opts?.emails)
  if (tokens.length === 0) {
    // Legacy single-token path
    const tok = await getValidGoogleAccessToken(userId)
    if (!tok.ok) throw new Error(tok.error)
    return listUpcomingForAccount(userId, tok.email || 'primary', opts)
  }

  const perAccount = Math.max(
    5,
    Math.ceil((opts?.maxResults || 20) / tokens.length)
  )
  const batches = await Promise.all(
    tokens.map(async (t) => {
      try {
        return await listUpcomingForAccount(userId, t.email, {
          ...opts,
          maxResults: perAccount,
        })
      } catch (e) {
        console.warn(
          '[calendar] list failed for',
          t.email,
          e instanceof Error ? e.message : e
        )
        return [] as CalendarEventSummary[]
      }
    })
  )
  const merged = batches.flat().sort((a, b) => {
    const sa = a.start ? Date.parse(a.start) : 0
    const sb = b.start ? Date.parse(b.start) : 0
    return sa - sb
  })
  return merged.slice(0, opts?.maxResults || 40)
}

export async function createCalendarEvent(
  userId: string,
  input: CalendarEventInput & { accountEmail?: string }
): Promise<CalendarEventSummary> {
  const accountEmail = input.accountEmail
  const res = await googleFetch(
    userId,
    `${CAL_BASE}/calendars/primary/events?sendUpdates=all`,
    {
      method: 'POST',
      body: JSON.stringify(toEventBody(input)),
      accountEmail,
    }
  )
  const data = (await res.json()) as Record<string, unknown> & {
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(data.error?.message || `Calendar create HTTP ${res.status}`)
  }
  const tok = await getValidGoogleAccessToken(userId, accountEmail)
  return mapEvent(data, tok.ok ? tok.email || undefined : accountEmail)
}

export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  patch: Partial<CalendarEventInput> & { accountEmail?: string }
): Promise<CalendarEventSummary> {
  const scoped = parseScopedEventId(eventId)
  const accountEmail = patch.accountEmail || scoped.accountEmail
  const rawId = scoped.rawId
  const getRes = await googleFetch(
    userId,
    `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(rawId)}`,
    { accountEmail }
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
    `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(rawId)}?sendUpdates=all`,
    {
      method: 'PUT',
      body: JSON.stringify({ ...existing, ...merged }),
      accountEmail,
    }
  )
  const data = (await res.json()) as Record<string, unknown> & {
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(data.error?.message || `Calendar update HTTP ${res.status}`)
  }
  return mapEvent(data, accountEmail)
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string,
  accountEmail?: string
): Promise<{ deleted: true; eventId: string }> {
  const scoped = parseScopedEventId(eventId)
  const email = accountEmail || scoped.accountEmail
  const rawId = scoped.rawId
  const res = await googleFetch(
    userId,
    `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(rawId)}?sendUpdates=all`,
    { method: 'DELETE', accountEmail: email }
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
 * Query FreeBusy for each linked Google email, then find slots where ALL are free.
 */
export async function findMutualFreeSlots(
  userId: string,
  opts: {
    emails?: string[]
    /** Window start (default: now). */
    timeMinIso?: string
    /** Window end (default: +7 days). */
    timeMaxIso?: string
    durationMinutes?: number
    timeZone?: string
    /** Working hours local to timeZone */
    workdayStartHour?: number
    workdayEndHour?: number
    maxSlots?: number
  } = {}
): Promise<{
  accounts: string[]
  busy: AccountBusyBlock[]
  slots: FreeSlot[]
  window: { start: string; end: string }
  messageAr: string
}> {
  const duration = Math.max(15, opts.durationMinutes || 60)
  const tz = opts.timeZone || 'Asia/Riyadh'
  const timeMin = opts.timeMinIso
    ? new Date(opts.timeMinIso)
    : new Date()
  const timeMax = opts.timeMaxIso
    ? new Date(opts.timeMaxIso)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const workStart = opts.workdayStartHour ?? 9
  const workEnd = opts.workdayEndHour ?? 17
  const maxSlots = opts.maxSlots || 12

  const tokens = await getValidGoogleAccessTokens(userId, opts.emails)
  if (tokens.length === 0) {
    throw new Error(
      'لا حسابات Google مربوطة. اربط بريداً أو أكثر من الإعدادات → تقويم Google.'
    )
  }

  const busy: AccountBusyBlock[] = []
  const accounts: string[] = []

  await Promise.all(
    tokens.map(async (t) => {
      accounts.push(t.email)
      const res = await fetch(`${CAL_BASE}/freeBusy`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${t.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          timeZone: tz,
          items: [{ id: 'primary' }],
        }),
      })
      const data = (await res.json()) as {
        calendars?: Record<
          string,
          { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }
        >
        error?: { message?: string }
      }
      if (!res.ok) {
        throw new Error(
          data.error?.message || `FreeBusy HTTP ${res.status} (${t.email})`
        )
      }
      const blocks = data.calendars?.primary?.busy || []
      for (const b of blocks) {
        busy.push({ email: t.email, start: b.start, end: b.end })
      }
    })
  )

  // Merge all busy intervals (anyone busy ⇒ slot blocked for mutual meeting)
  const mergedBusy = mergeIntervals(
    busy.map((b) => ({
      start: Date.parse(b.start),
      end: Date.parse(b.end),
    }))
  )

  const slots = findOpenSlots({
    windowStart: timeMin.getTime(),
    windowEnd: timeMax.getTime(),
    busy: mergedBusy,
    durationMs: duration * 60_000,
    workStartHour: workStart,
    workEndHour: workEnd,
    timeZone: tz,
    maxSlots,
  })

  return {
    accounts,
    busy,
    slots,
    window: { start: timeMin.toISOString(), end: timeMax.toISOString() },
    messageAr:
      tokens.length < 2
        ? `حُسب التفرّغ لحساب واحد (${tokens[0].email}). اربط بريداً ثانياً لمقارنة الجميع.`
        : slots.length === 0
          ? `لا فترات مشتركة متاحة لـ ${tokens.length} حسابات خلال النافذة (مدة ${duration} د).`
          : `وُجد ${slots.length} فترة مشتركة حيث كل الحسابات (${tokens.length}) متفرغون.`,
  }
}

function mergeIntervals(
  intervals: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  const sorted = intervals
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .sort((a, b) => a.start - b.start)
  if (!sorted.length) return []
  const out = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]
    const last = out[out.length - 1]
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end)
    } else {
      out.push({ ...cur })
    }
  }
  return out
}

/** Local hour helpers for Asia/Riyadh-style zones via Intl. */
function localParts(ms: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value])
  )
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour === '24' ? '0' : parts.hour),
    min: Number(parts.minute),
  }
}

function findOpenSlots(opts: {
  windowStart: number
  windowEnd: number
  busy: Array<{ start: number; end: number }>
  durationMs: number
  workStartHour: number
  workEndHour: number
  timeZone: string
  maxSlots: number
}): FreeSlot[] {
  const slots: FreeSlot[] = []
  const step = 15 * 60_000
  let cursor = opts.windowStart
  // Snap to next 15m
  cursor = Math.ceil(cursor / step) * step

  while (cursor + opts.durationMs <= opts.windowEnd && slots.length < opts.maxSlots) {
    const end = cursor + opts.durationMs
    const startLocal = localParts(cursor, opts.timeZone)
    const endLocal = localParts(end - 1, opts.timeZone)
    const inWorkHours =
      startLocal.h >= opts.workStartHour &&
      endLocal.h < opts.workEndHour &&
      startLocal.d === endLocal.d &&
      startLocal.h < opts.workEndHour

    // Skip Fri/Sat in Saudi week (5=Fri, 6=Sat in JS if we map via weekday)
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: opts.timeZone,
      weekday: 'short',
    }).format(new Date(cursor))
    const weekend = weekday === 'Fri' || weekday === 'Sat'

    const overlapsBusy = opts.busy.some(
      (b) => cursor < b.end && end > b.start
    )

    if (inWorkHours && !weekend && !overlapsBusy) {
      slots.push({
        startIso: new Date(cursor).toISOString(),
        endIso: new Date(end).toISOString(),
        durationMinutes: Math.round(opts.durationMs / 60_000),
      })
      cursor = end
    } else {
      cursor += step
    }
  }
  return slots
}

export async function listLinkedCalendarEmails(userId: string) {
  const rows = await listGoogleAccounts(userId)
  return rows.map((r) => ({
    email: r.email,
    scopes: r.scopes,
    updatedAt: r.updated_at,
  }))
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
