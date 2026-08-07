/**
 * Shared room calendar — source of truth for the team board.
 * Belongs to scopeId (the room), not a personal Google account.
 * Optional Google sync can push outward later.
 */

import { getSupabaseAdmin } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import {
  filterOutTestCalendarEvents,
  isTestCalendarTitle,
} from '@/lib/rooms/calendar-test-noise'

export type RoomEventSource = 'manual' | 'ai' | 'email' | 'import' | 'google_sync'
export type RoomEventStatus = 'confirmed' | 'tentative' | 'cancelled'

export type RoomCalendarEvent = {
  id: string
  scopeId: string
  titleAr: string
  descriptionAr: string | null
  startsAt: string
  endsAt: string
  allDay: boolean
  locationAr: string | null
  attendees: string[]
  source: RoomEventSource
  createdBy: string | null
  createdByAr: string | null
  status: RoomEventStatus
  googleEventId: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

type DbRow = {
  id: string
  scope_id: string
  title_ar: string
  description_ar: string | null
  starts_at: string
  ends_at: string
  all_day: boolean
  location_ar: string | null
  attendees: unknown
  source: string
  created_by: string | null
  created_by_ar: string | null
  status: string
  google_event_id: string | null
  meta: unknown
  created_at: string
  updated_at: string
}

const memory = new Map<string, RoomCalendarEvent>()

function rowToEvent(row: DbRow): RoomCalendarEvent {
  const attendees = Array.isArray(row.attendees)
    ? row.attendees.map(String)
    : typeof row.attendees === 'string'
      ? (() => {
          try {
            const p = JSON.parse(row.attendees)
            return Array.isArray(p) ? p.map(String) : []
          } catch {
            return []
          }
        })()
      : []
  return {
    id: row.id,
    scopeId: row.scope_id,
    titleAr: row.title_ar,
    descriptionAr: row.description_ar,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: Boolean(row.all_day),
    locationAr: row.location_ar,
    attendees,
    source: (row.source as RoomEventSource) || 'manual',
    createdBy: row.created_by,
    createdByAr: row.created_by_ar,
    status: (row.status as RoomEventStatus) || 'confirmed',
    googleEventId: row.google_event_id,
    meta:
      row.meta && typeof row.meta === 'object'
        ? (row.meta as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type ConflictInfo = {
  eventId: string
  titleAr: string
  startsAt: string
  endsAt: string
  overlapMinutes: number
}

function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const start = Math.max(aStart.getTime(), bStart.getTime())
  const end = Math.min(aEnd.getTime(), bEnd.getTime())
  return Math.max(0, Math.round((end - start) / 60_000))
}

export function findRoomConflicts(
  events: RoomCalendarEvent[],
  candidate: { startsAt: string; endsAt: string; excludeId?: string }
): ConflictInfo[] {
  const cStart = new Date(candidate.startsAt)
  const cEnd = new Date(candidate.endsAt)
  if (Number.isNaN(cStart.getTime()) || Number.isNaN(cEnd.getTime())) return []
  const out: ConflictInfo[] = []
  for (const e of events) {
    if (e.status === 'cancelled') continue
    if (candidate.excludeId && e.id === candidate.excludeId) continue
    const mins = overlapMinutes(
      cStart,
      cEnd,
      new Date(e.startsAt),
      new Date(e.endsAt)
    )
    if (mins > 0) {
      out.push({
        eventId: e.id,
        titleAr: e.titleAr,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        overlapMinutes: mins,
      })
    }
  }
  return out
}

/** Propose shifted start that clears the first conflict block. */
export function proposeAdjustedSlot(
  events: RoomCalendarEvent[],
  startsAt: string,
  endsAt: string,
  excludeId?: string
): { startsAt: string; endsAt: string; messageAr: string } | null {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const duration = end.getTime() - start.getTime()
  if (duration <= 0) return null
  let cursor = new Date(start)
  for (let i = 0; i < 24; i++) {
    const nextEnd = new Date(cursor.getTime() + duration)
    const conflicts = findRoomConflicts(events, {
      startsAt: cursor.toISOString(),
      endsAt: nextEnd.toISOString(),
      excludeId,
    })
    if (conflicts.length === 0) {
      if (i === 0) return null
      return {
        startsAt: cursor.toISOString(),
        endsAt: nextEnd.toISOString(),
        messageAr: `اقتراح بعد إزالة التعارض: ${cursor.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`,
      }
    }
    // Jump to end of first overlapping event + 15m
    const blocker = conflicts.sort(
      (a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime()
    )[0]
    cursor = new Date(new Date(blocker.endsAt).getTime() + 15 * 60_000)
  }
  return null
}

export async function listRoomCalendarEvents(opts: {
  scopeId: string
  from?: string
  to?: string
  includeCancelled?: boolean
  /**
   * When true, hide QA titles like «اختبار تقويم الفريق».
   * Default false — list shows all non-cancelled events; use cleanup_test to soft-cancel noise.
   */
  hideTestTitles?: boolean
}): Promise<RoomCalendarEvent[]> {
  const hideTest = opts.hideTestTitles === true
  const sb = getSupabaseAdmin()
  let rows: RoomCalendarEvent[] | null = null
  if (sb) {
    let q = sb
      .from('room_calendar_events')
      .select('*')
      .eq('scope_id', opts.scopeId)
      .order('starts_at', { ascending: true })
      .limit(200)
    if (!opts.includeCancelled) q = q.neq('status', 'cancelled')
    if (opts.from) q = q.gte('starts_at', opts.from)
    if (opts.to) q = q.lte('starts_at', opts.to)
    const { data, error } = await q
    if (!error && data) {
      rows = (data as DbRow[]).map(rowToEvent)
    }
  }
  if (rows == null) {
    rows = [...memory.values()]
      .filter((e) => e.scopeId === opts.scopeId)
      .filter((e) => opts.includeCancelled || e.status !== 'cancelled')
      .filter((e) => !opts.from || e.startsAt >= opts.from)
      .filter((e) => !opts.to || e.startsAt <= opts.to)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  }
  return hideTest ? filterOutTestCalendarEvents(rows) : rows
}

/**
 * Single calendar source of truth for product surfaces:
 * home digest, full calendar, board, Telegram fast-path / room_calendar_* tools.
 * Always hides cancelled + QA test titles so web and bot agree.
 */
export async function getRoomAgenda(opts: {
  scopeId: string
  from?: string
  to?: string
  includeCancelled?: boolean
  /** Override only for admin cleanup — default hides test titles. */
  hideTestTitles?: boolean
}): Promise<RoomCalendarEvent[]> {
  return listRoomCalendarEvents({
    scopeId: opts.scopeId,
    from: opts.from,
    to: opts.to,
    includeCancelled: opts.includeCancelled === true,
    hideTestTitles: opts.hideTestTitles !== false,
  })
}

/** Soft-cancel known test/QA calendar events for a room (director cleanup). */
export async function cancelTestCalendarEvents(scopeId: string): Promise<{
  cancelled: number
  titles: string[]
}> {
  const all = await listRoomCalendarEvents({
    scopeId,
    includeCancelled: false,
    hideTestTitles: false,
  })
  const targets = all.filter((e) => isTestCalendarTitle(e.titleAr))
  const titles: string[] = []
  for (const e of targets) {
    await cancelRoomCalendarEvent(e.id, scopeId)
    titles.push(e.titleAr)
  }
  return { cancelled: titles.length, titles }
}

export async function findRoomEventByGoogleId(
  scopeId: string,
  googleEventId: string
): Promise<RoomCalendarEvent | null> {
  if (!googleEventId) return null
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('room_calendar_events')
      .select('*')
      .eq('scope_id', scopeId)
      .eq('google_event_id', googleEventId)
      .maybeSingle()
    if (!error && data) return rowToEvent(data as DbRow)
  }
  for (const e of memory.values()) {
    if (e.scopeId === scopeId && e.googleEventId === googleEventId) return e
  }
  return null
}

export async function createRoomCalendarEvent(opts: {
  scopeId: string
  titleAr: string
  descriptionAr?: string
  startsAt: string
  endsAt: string
  allDay?: boolean
  locationAr?: string
  attendees?: string[]
  source?: RoomEventSource
  createdBy?: string
  createdByAr?: string
  status?: RoomEventStatus
  googleEventId?: string | null
  meta?: Record<string, unknown>
  /** Skip conflict Telegram noise (used by Google sync). */
  quiet?: boolean
}): Promise<{ event: RoomCalendarEvent; conflicts: ConflictInfo[]; suggestion: ReturnType<typeof proposeAdjustedSlot> }> {
  const titleAr = opts.titleAr.trim()
  if (!titleAr) throw new Error('عنوان الموعد مطلوب')
  const startsAt = new Date(opts.startsAt).toISOString()
  const endsAt = new Date(opts.endsAt).toISOString()
  if (new Date(endsAt) <= new Date(startsAt)) {
    throw new Error('وقت النهاية يجب أن يكون بعد البداية')
  }

  const existing = await listRoomCalendarEvents({
    scopeId: opts.scopeId,
    includeCancelled: true,
    hideTestTitles: false,
  })
  const active = existing.filter((e) => e.status !== 'cancelled')
  const conflicts = findRoomConflicts(active, { startsAt, endsAt })
  const suggestion =
    conflicts.length > 0
      ? proposeAdjustedSlot(active, startsAt, endsAt)
      : null

  const now = new Date().toISOString()
  const event: RoomCalendarEvent = {
    id: randomUUID(),
    scopeId: opts.scopeId,
    titleAr,
    descriptionAr: opts.descriptionAr?.trim() || null,
    startsAt,
    endsAt,
    allDay: Boolean(opts.allDay),
    locationAr: opts.locationAr?.trim() || null,
    attendees: (opts.attendees || []).map((e) => e.trim()).filter(Boolean),
    source: opts.source || 'manual',
    createdBy: opts.createdBy || null,
    createdByAr: opts.createdByAr || null,
    status: opts.status || 'confirmed',
    googleEventId: opts.googleEventId || null,
    meta: opts.meta || {},
    createdAt: now,
    updatedAt: now,
  }

  const sb = getSupabaseAdmin()
  let saved = event
  if (sb) {
    const { data, error } = await sb
      .from('room_calendar_events')
      .insert({
        id: event.id,
        scope_id: event.scopeId,
        title_ar: event.titleAr,
        description_ar: event.descriptionAr,
        starts_at: event.startsAt,
        ends_at: event.endsAt,
        all_day: event.allDay,
        location_ar: event.locationAr,
        attendees: event.attendees,
        source: event.source,
        created_by: event.createdBy,
        created_by_ar: event.createdByAr,
        status: event.status,
        google_event_id: event.googleEventId,
        meta: event.meta,
      })
      .select('*')
      .single()
    if (error || !data) {
      throw new Error(
        error?.message
          ? `تعذّر حفظ الموعد في قاعدة البيانات: ${error.message}`
          : 'تعذّر حفظ الموعد في قاعدة البيانات'
      )
    }
    saved = rowToEvent(data as DbRow)
    memory.set(saved.id, saved)
  } else {
    memory.set(event.id, event)
  }

  if (conflicts.length > 0 && !opts.quiet) {
    void notifyRoomCalendarConflicts({
      scopeId: opts.scopeId,
      titleAr: saved.titleAr,
      startsAt: saved.startsAt,
      conflicts,
      createdByAr: saved.createdByAr,
    })
  }

  return { event: saved, conflicts, suggestion }
}

export async function updateRoomCalendarEvent(
  id: string,
  scopeId: string,
  patch: Partial<{
    titleAr: string
    descriptionAr: string | null
    startsAt: string
    endsAt: string
    allDay: boolean
    locationAr: string | null
    attendees: string[]
    status: RoomEventStatus
    googleEventId: string | null
    meta: Record<string, unknown>
  }>
): Promise<{ event: RoomCalendarEvent; conflicts: ConflictInfo[] }> {
  const list = await listRoomCalendarEvents({
    scopeId,
    includeCancelled: true,
    hideTestTitles: false,
  })
  const current = list.find((e) => e.id === id)
  if (!current) throw new Error('الموعد غير موجود في تقويم الغرفة')

  const next: RoomCalendarEvent = {
    ...current,
    titleAr: patch.titleAr?.trim() || current.titleAr,
    descriptionAr:
      patch.descriptionAr !== undefined
        ? patch.descriptionAr
        : current.descriptionAr,
    startsAt: patch.startsAt
      ? new Date(patch.startsAt).toISOString()
      : current.startsAt,
    endsAt: patch.endsAt
      ? new Date(patch.endsAt).toISOString()
      : current.endsAt,
    allDay: patch.allDay ?? current.allDay,
    locationAr:
      patch.locationAr !== undefined ? patch.locationAr : current.locationAr,
    attendees: patch.attendees ?? current.attendees,
    status: patch.status ?? current.status,
    googleEventId:
      patch.googleEventId !== undefined
        ? patch.googleEventId
        : current.googleEventId,
    meta: patch.meta ?? current.meta,
    updatedAt: new Date().toISOString(),
  }

  const others = list.filter((e) => e.id !== id && e.status !== 'cancelled')
  const conflicts = findRoomConflicts(others, {
    startsAt: next.startsAt,
    endsAt: next.endsAt,
    excludeId: id,
  })

  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('room_calendar_events')
      .update({
        title_ar: next.titleAr,
        description_ar: next.descriptionAr,
        starts_at: next.startsAt,
        ends_at: next.endsAt,
        all_day: next.allDay,
        location_ar: next.locationAr,
        attendees: next.attendees,
        status: next.status,
        google_event_id: next.googleEventId,
        meta: next.meta,
        updated_at: next.updatedAt,
      })
      .eq('id', id)
      .eq('scope_id', scopeId)
      .select('*')
      .single()
    if (!error && data) {
      return { event: rowToEvent(data as DbRow), conflicts }
    }
  }
  memory.set(id, next)
  return { event: next, conflicts }
}

/** Notify room (Telegram + in-app inbox) when a slot overlaps another. */
export async function notifyRoomCalendarConflicts(opts: {
  scopeId: string
  titleAr: string
  startsAt: string
  conflicts: ConflictInfo[]
  createdByAr?: string | null
}): Promise<{ telegramOk: boolean }> {
  if (!opts.conflicts.length) return { telegramOk: false }
  const when = (() => {
    try {
      return new Date(opts.startsAt).toLocaleString('ar-SA', {
        timeZone: 'Asia/Riyadh',
      })
    } catch {
      return opts.startsAt
    }
  })()
  const lines = opts.conflicts
    .slice(0, 6)
    .map((c) => `• «${c.titleAr}» — تداخل ${c.overlapMinutes} د`)
  const messageAr = [
    '⚠️ تعارض مواعيد في تقويم الغرفة المشترك',
    `الموعد: «${opts.titleAr}» · ${when}`,
    opts.createdByAr ? `أضافه: ${opts.createdByAr}` : null,
    'يتعارض مع:',
    ...lines,
    'افتح: /?section=calendar',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { emitPassiveNotification, emitNotification } = await import(
      '@/lib/notifications/emit'
    )
    await emitPassiveNotification({
      messageAr,
      actionName: 'room_calendar_conflict',
    })
    const tg = await emitNotification({
      channel: 'telegram',
      textAr: messageAr,
      meta: { scopeId: opts.scopeId },
    })
    return { telegramOk: tg.ok }
  } catch {
    return { telegramOk: false }
  }
}

export async function cancelRoomCalendarEvent(id: string, scopeId: string) {
  return updateRoomCalendarEvent(id, scopeId, { status: 'cancelled' })
}

/** Merge candidate slots from many employee emails / AI proposals into the board. */
export async function ingestProposedDates(opts: {
  scopeId: string
  proposals: Array<{
    titleAr: string
    startsAt: string
    endsAt: string
    fromEmail?: string
    notesAr?: string
  }>
  createdBy?: string
  createdByAr?: string
}): Promise<{
  created: RoomCalendarEvent[]
  skipped: Array<{ titleAr: string; reasonAr: string }>
  adjusted: Array<{ titleAr: string; from: string; to: string }>
}> {
  const created: RoomCalendarEvent[] = []
  const skipped: Array<{ titleAr: string; reasonAr: string }> = []
  const adjusted: Array<{ titleAr: string; from: string; to: string }> = []

  for (const p of opts.proposals) {
    try {
      let startsAt = p.startsAt
      let endsAt = p.endsAt
      const existing = await listRoomCalendarEvents({ scopeId: opts.scopeId })
      const conflicts = findRoomConflicts(existing, { startsAt, endsAt })
      if (conflicts.length > 0) {
        const sug = proposeAdjustedSlot(existing, startsAt, endsAt)
        if (sug) {
          adjusted.push({
            titleAr: p.titleAr,
            from: startsAt,
            to: sug.startsAt,
          })
          startsAt = sug.startsAt
          endsAt = sug.endsAt
        }
      }
      const { event } = await createRoomCalendarEvent({
        scopeId: opts.scopeId,
        titleAr: p.titleAr,
        descriptionAr: p.notesAr,
        startsAt,
        endsAt,
        attendees: p.fromEmail ? [p.fromEmail] : [],
        source: p.fromEmail ? 'email' : 'ai',
        createdBy: opts.createdBy,
        createdByAr: opts.createdByAr || 'الوكيل',
        meta: p.fromEmail ? { fromEmail: p.fromEmail } : {},
      })
      created.push(event)
    } catch (e) {
      skipped.push({
        titleAr: p.titleAr,
        reasonAr: e instanceof Error ? e.message : 'فشل الإضافة',
      })
    }
  }
  return { created, skipped, adjusted }
}

export type RoomCalendarConflictPair = {
  a: ConflictInfo & { createdByAr: string | null }
  b: ConflictInfo & { createdByAr: string | null }
}

/**
 * Sort board by date/time then who added; surface overlapping pairs;
 * optionally auto-shift later events; notify room on conflicts.
 */
export async function reconcileRoomCalendar(opts: {
  scopeId: string
  autoAdjust?: boolean
  notify?: boolean
}): Promise<{
  events: RoomCalendarEvent[]
  conflicts: RoomCalendarConflictPair[]
  adjusted: Array<{ id: string; titleAr: string; from: string; to: string }>
  messageAr: string
}> {
  let events = await listRoomCalendarEvents({ scopeId: opts.scopeId })
  events = [...events]
    .filter((e) => e.status !== 'cancelled')
    .sort((a, b) => {
      const byStart = a.startsAt.localeCompare(b.startsAt)
      if (byStart) return byStart
      const byWho = (a.createdByAr || '').localeCompare(b.createdByAr || '', 'ar')
      if (byWho) return byWho
      return a.createdAt.localeCompare(b.createdAt)
    })

  const conflicts: RoomCalendarConflictPair[] = []
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]
      const b = events[j]
      if (new Date(b.startsAt).getTime() >= new Date(a.endsAt).getTime()) break
      const mins = overlapMinutes(
        new Date(a.startsAt),
        new Date(a.endsAt),
        new Date(b.startsAt),
        new Date(b.endsAt)
      )
      if (mins > 0) {
        conflicts.push({
          a: {
            eventId: a.id,
            titleAr: a.titleAr,
            startsAt: a.startsAt,
            endsAt: a.endsAt,
            overlapMinutes: mins,
            createdByAr: a.createdByAr,
          },
          b: {
            eventId: b.id,
            titleAr: b.titleAr,
            startsAt: b.startsAt,
            endsAt: b.endsAt,
            overlapMinutes: mins,
            createdByAr: b.createdByAr,
          },
        })
      }
    }
  }

  const adjusted: Array<{
    id: string
    titleAr: string
    from: string
    to: string
  }> = []

  if (opts.autoAdjust && conflicts.length > 0) {
    const shiftedIds = new Set<string>()
    let working = [...events]
    for (const pair of conflicts) {
      const aCreated =
        working.find((e) => e.id === pair.a.eventId)?.createdAt || ''
      const bCreated =
        working.find((e) => e.id === pair.b.eventId)?.createdAt || ''
      const keepA =
        pair.a.startsAt < pair.b.startsAt ||
        (pair.a.startsAt === pair.b.startsAt && aCreated <= bCreated)
      const moveId = keepA ? pair.b.eventId : pair.a.eventId
      if (shiftedIds.has(moveId)) continue
      const later = working.find((e) => e.id === moveId)
      if (!later) continue
      const others = working.filter((e) => e.id !== later.id)
      const sug = proposeAdjustedSlot(
        others,
        later.startsAt,
        later.endsAt,
        later.id
      )
      if (!sug) continue
      const from = later.startsAt
      await updateRoomCalendarEvent(later.id, opts.scopeId, {
        startsAt: sug.startsAt,
        endsAt: sug.endsAt,
      })
      adjusted.push({
        id: later.id,
        titleAr: later.titleAr,
        from,
        to: sug.startsAt,
      })
      shiftedIds.add(later.id)
      working = working.map((e) =>
        e.id === later.id
          ? { ...e, startsAt: sug.startsAt, endsAt: sug.endsAt }
          : e
      )
    }
  }

  if (opts.notify !== false && conflicts.length > 0) {
    const sample = conflicts[0]
    await notifyRoomCalendarConflicts({
      scopeId: opts.scopeId,
      titleAr: sample.a.titleAr,
      startsAt: sample.a.startsAt,
      createdByAr: 'ترتيب التقويم',
      conflicts: conflicts.slice(0, 8).map((p) => ({
        eventId: p.b.eventId,
        titleAr: `«${p.a.titleAr}» ↔ «${p.b.titleAr}»`,
        startsAt: p.b.startsAt,
        endsAt: p.b.endsAt,
        overlapMinutes: p.a.overlapMinutes,
      })),
    })
  }

  const refreshed = await listRoomCalendarEvents({ scopeId: opts.scopeId })
  const sorted = [...refreshed].sort((a, b) => {
    const byStart = a.startsAt.localeCompare(b.startsAt)
    if (byStart) return byStart
    return (a.createdByAr || '').localeCompare(b.createdByAr || '', 'ar')
  })

  const messageAr =
    conflicts.length === 0
      ? `تقويم الغرفة مرتّب: ${sorted.length} موعداً بلا تعارض.`
      : opts.autoAdjust && adjusted.length
        ? `وُجد ${conflicts.length} تعارض — عُدّل زمن ${adjusted.length} موعداً. راجع اللوحة.`
        : `تنبيه: ${conflicts.length} تعارض في نفس الوقت. اطلب التسوية التلقائية أو عدّل يدوياً.`

  return { events: sorted, conflicts, adjusted, messageAr }
}
