/**
 * Google Calendar → shared room calendar (opt-in per member).
 * Room DB remains the display source of truth; mirrored rows use source=google_sync.
 */

import { listPrimaryEventsInWindow } from '@/lib/google/calendar'
import {
  listCalendarSyncEnabledMembers,
  listRoomMembers,
} from '@/lib/rooms/persist'
import {
  cancelRoomCalendarEvent,
  createRoomCalendarEvent,
  findRoomEventByGoogleId,
  listRoomCalendarEvents,
  updateRoomCalendarEvent,
  type RoomCalendarEvent,
} from '@/lib/rooms/room-calendar'

/** Sync window: next 21 days on primary calendar. */
export const GOOGLE_ROOM_SYNC_DAYS = 21

export type GoogleRoomSyncResult = {
  scopeId: string
  userId: string
  created: number
  updated: number
  cancelled: number
  skipped: number
  scanned: number
  messageAr: string
  error?: string
}

function allDayEndIso(startDate: string): string {
  // Google all-day end is exclusive (next day as date). Use end of start day Riyadh.
  const d = new Date(`${startDate}T23:59:59+03:00`)
  return d.toISOString()
}

function googleTimes(ev: {
  start?: string
  end?: string
}): { startsAt: string; endsAt: string; allDay: boolean } | null {
  if (!ev.start) return null
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(ev.start)
  let startsAt: string
  let endsAt: string
  if (allDay) {
    startsAt = new Date(`${ev.start}T00:00:00+03:00`).toISOString()
    endsAt = ev.end
      ? /^\d{4}-\d{2}-\d{2}$/.test(ev.end)
        ? new Date(
            new Date(`${ev.end}T00:00:00+03:00`).getTime() - 1000
          ).toISOString()
        : new Date(ev.end).toISOString()
      : allDayEndIso(ev.start)
  } else {
    startsAt = new Date(ev.start).toISOString()
    endsAt = ev.end
      ? new Date(ev.end).toISOString()
      : new Date(new Date(ev.start).getTime() + 3600_000).toISOString()
  }
  if (!(new Date(endsAt) > new Date(startsAt))) {
    endsAt = new Date(new Date(startsAt).getTime() + 3600_000).toISOString()
  }
  return { startsAt, endsAt, allDay }
}

function needsUpdate(
  room: RoomCalendarEvent,
  next: {
    titleAr: string
    descriptionAr: string | null
    startsAt: string
    endsAt: string
    allDay: boolean
    locationAr: string | null
    status: 'confirmed' | 'cancelled' | 'tentative'
  }
) {
  return (
    room.titleAr !== next.titleAr ||
    (room.descriptionAr || '') !== (next.descriptionAr || '') ||
    room.startsAt !== next.startsAt ||
    room.endsAt !== next.endsAt ||
    room.allDay !== next.allDay ||
    (room.locationAr || '') !== (next.locationAr || '') ||
    room.status !== next.status
  )
}

/**
 * Pull one opted-in member's upcoming Google events into the room calendar.
 */
export async function syncGoogleCalendarToRoom(opts: {
  scopeId: string
  userId: string
  displayNameAr?: string | null
  daysAhead?: number
}): Promise<GoogleRoomSyncResult> {
  const scopeId = opts.scopeId
  const userId = opts.userId
  const nameAr = opts.displayNameAr?.trim() || 'عضو'
  const days = opts.daysAhead ?? GOOGLE_ROOM_SYNC_DAYS
  const empty: GoogleRoomSyncResult = {
    scopeId,
    userId,
    created: 0,
    updated: 0,
    cancelled: 0,
    skipped: 0,
    scanned: 0,
    messageAr: '',
  }

  let googleEvents
  try {
    googleEvents = await listPrimaryEventsInWindow(userId, {
      daysAhead: days,
      maxResults: 80,
      showDeleted: true,
    })
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : 'فشل جلب تقويم Google',
      messageAr: 'تعذّر مزامنة Google — تأكد من ربط التقويم.',
    }
  }

  const windowEnd = Date.now() + days * 86400_000
  const seenIds = new Set<string>()
  let created = 0
  let updated = 0
  let cancelled = 0
  let skipped = 0

  for (const g of googleEvents) {
    if (!g.id) {
      skipped++
      continue
    }
    seenIds.add(g.id)
    const times = googleTimes(g)
    if (!times) {
      skipped++
      continue
    }

    const isCancelled = g.status === 'cancelled'
    const status = isCancelled
      ? ('cancelled' as const)
      : g.status === 'tentative'
        ? ('tentative' as const)
        : ('confirmed' as const)

    const titleAr = (g.summary || '(بدون عنوان)').trim() || '(بدون عنوان)'
    const descriptionAr = g.description?.trim() || null
    const locationAr = g.location?.trim() || null
    const meta = {
      googleSync: true,
      googleAccountEmail: g.accountEmail || null,
      googleHtmlLink: g.htmlLink || null,
      syncedAt: new Date().toISOString(),
    }

    const existing = await findRoomEventByGoogleId(scopeId, g.id)
    if (existing) {
      // Don't overwrite site-created events that already store this google_event_id (copy-out).
      if (existing.source !== 'google_sync') {
        skipped++
        continue
      }
      if (
        needsUpdate(existing, {
          titleAr,
          descriptionAr,
          startsAt: times.startsAt,
          endsAt: times.endsAt,
          allDay: times.allDay,
          locationAr,
          status,
        })
      ) {
        await updateRoomCalendarEvent(existing.id, scopeId, {
          titleAr,
          descriptionAr,
          startsAt: times.startsAt,
          endsAt: times.endsAt,
          allDay: times.allDay,
          locationAr,
          status,
          meta: { ...existing.meta, ...meta },
        })
        if (status === 'cancelled') cancelled++
        else updated++
      } else {
        skipped++
      }
      continue
    }

    if (isCancelled) {
      skipped++
      continue
    }

    try {
      await createRoomCalendarEvent({
        scopeId,
        titleAr,
        descriptionAr: descriptionAr || undefined,
        startsAt: times.startsAt,
        endsAt: times.endsAt,
        allDay: times.allDay,
        locationAr: locationAr || undefined,
        source: 'google_sync',
        createdBy: userId,
        createdByAr: nameAr,
        status,
        googleEventId: g.id,
        meta,
        quiet: true,
      })
      created++
    } catch (e) {
      // Unique index race / duplicate
      const msg = e instanceof Error ? e.message : ''
      if (/duplicate|unique|23505/i.test(msg)) {
        skipped++
      } else {
        skipped++
        console.warn('[google→room sync] create failed', msg)
      }
    }
  }

  // Soft-cancel mirrors that disappeared from Google within the window.
  const roomSynced = await listRoomCalendarEvents({
    scopeId,
    from: new Date().toISOString(),
    to: new Date(windowEnd).toISOString(),
    includeCancelled: false,
    hideTestTitles: false,
  })
  for (const e of roomSynced) {
    if (e.source !== 'google_sync') continue
    if (e.createdBy !== userId) continue
    if (!e.googleEventId || seenIds.has(e.googleEventId)) continue
    await cancelRoomCalendarEvent(e.id, scopeId)
    cancelled++
  }

  const messageAr =
    created + updated + cancelled === 0
      ? `لا تغييرات من Google (${googleEvents.length} موعداً ممسوحاً).`
      : `مزامنة Google: أُضيف ${created} · حُدّث ${updated} · أُلغي ${cancelled}.`

  return {
    scopeId,
    userId,
    created,
    updated,
    cancelled,
    skipped,
    scanned: googleEvents.length,
    messageAr,
  }
}

/** Sync current user if they opted in for this room. */
export async function syncCurrentUserGoogleToRoom(opts: {
  scopeId: string
  userId: string
  email?: string | null
  displayNameAr?: string | null
}): Promise<GoogleRoomSyncResult & { enabled: boolean }> {
  const { members } = await listRoomMembers(opts.scopeId)
  const member =
    members.find((m) => m.userId === opts.userId) ||
    (opts.email
      ? members.find(
          (m) => m.email && m.email.toLowerCase() === opts.email!.toLowerCase()
        )
      : undefined)

  if (!member?.calendarSyncEnabled) {
    return {
      scopeId: opts.scopeId,
      userId: opts.userId,
      created: 0,
      updated: 0,
      cancelled: 0,
      skipped: 0,
      scanned: 0,
      enabled: false,
      messageAr: 'مزامنة Google→الفريق غير مفعّلة لحسابك.',
    }
  }

  const result = await syncGoogleCalendarToRoom({
    scopeId: opts.scopeId,
    userId: opts.userId,
    displayNameAr: member.displayNameAr || opts.displayNameAr,
  })
  return { ...result, enabled: true }
}

/** Cron: sync every opted-in member across rooms. */
export async function syncAllOptedInGoogleToRooms(): Promise<{
  members: number
  results: GoogleRoomSyncResult[]
  messageAr: string
}> {
  const members = await listCalendarSyncEnabledMembers()
  const results: GoogleRoomSyncResult[] = []
  for (const m of members) {
    if (!m.userId) continue
    const r = await syncGoogleCalendarToRoom({
      scopeId: m.scopeId,
      userId: m.userId,
      displayNameAr: m.displayNameAr,
    })
    results.push(r)
  }
  const created = results.reduce((n, r) => n + r.created, 0)
  const updated = results.reduce((n, r) => n + r.updated, 0)
  const cancelled = results.reduce((n, r) => n + r.cancelled, 0)
  return {
    members: members.length,
    results,
    messageAr: `مزامنة جماعية: ${members.length} عضواً · +${created} / ~${updated} / −${cancelled}`,
  }
}
