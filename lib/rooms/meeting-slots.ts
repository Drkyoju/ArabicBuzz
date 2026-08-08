/**
 * Propose alternate meeting slots when the calendar has conflicts.
 */
import type { RoomCalendarEvent } from '@/lib/rooms/room-calendar'
import { findRoomConflicts } from '@/lib/rooms/room-calendar'

const TZ = 'Asia/Riyadh'
const WORK_START_H = 9
const WORK_END_H = 17

function fmtAr(iso: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: TZ,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export type FreeSlotSuggestion = {
  startsAt: string
  endsAt: string
  labelAr: string
}

/**
 * Suggest up to `count` free slots of `durationMs` starting from `fromIso`,
 * within work hours Asia/Riyadh, skipping room conflicts.
 */
export function proposeMeetingSlots(opts: {
  events: RoomCalendarEvent[]
  fromIso: string
  durationMs: number
  count?: number
  excludeId?: string
  daysAhead?: number
}): FreeSlotSuggestion[] {
  const duration = Math.max(opts.durationMs, 15 * 60_000)
  const count = Math.min(Math.max(opts.count || 3, 1), 6)
  const daysAhead = Math.min(Math.max(opts.daysAhead || 5, 1), 14)
  const out: FreeSlotSuggestion[] = []
  let cursor = new Date(opts.fromIso)
  if (Number.isNaN(cursor.getTime())) cursor = new Date()

  const deadline = new Date(cursor.getTime() + daysAhead * 86400_000)

  for (let guard = 0; guard < 200 && out.length < count; guard++) {
    // Snap into work hours (Riyadh = UTC+3)
    const riyadhMs = cursor.getTime() + 3 * 3600_000
    const d = new Date(riyadhMs)
    const h = d.getUTCHours()
    const m = d.getUTCMinutes()
    if (h < WORK_START_H) {
      d.setUTCHours(WORK_START_H, 0, 0, 0)
      cursor = new Date(d.getTime() - 3 * 3600_000)
    } else if (h >= WORK_END_H || (h === WORK_END_H - 1 && m > 0 && duration > 60 * 60_000)) {
      d.setUTCDate(d.getUTCDate() + 1)
      d.setUTCHours(WORK_START_H, 0, 0, 0)
      cursor = new Date(d.getTime() - 3 * 3600_000)
    }

    if (cursor > deadline) break

    const end = new Date(cursor.getTime() + duration)
    const endR = new Date(end.getTime() + 3 * 3600_000)
    if (endR.getUTCHours() > WORK_END_H || (endR.getUTCHours() === WORK_END_H && endR.getUTCMinutes() > 0)) {
      const next = new Date(riyadhMs)
      next.setUTCDate(next.getUTCDate() + 1)
      next.setUTCHours(WORK_START_H, 0, 0, 0)
      cursor = new Date(next.getTime() - 3 * 3600_000)
      continue
    }

    const conflicts = findRoomConflicts(opts.events, {
      startsAt: cursor.toISOString(),
      endsAt: end.toISOString(),
      excludeId: opts.excludeId,
    })
    if (conflicts.length === 0) {
      const startsAt = cursor.toISOString()
      const endsAt = end.toISOString()
      out.push({
        startsAt,
        endsAt,
        labelAr: `${fmtAr(startsAt)} → ${fmtAr(endsAt)}`,
      })
      cursor = new Date(end.getTime() + 30 * 60_000)
    } else {
      const blocker = conflicts.sort(
        (a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime()
      )[0]
      cursor = new Date(new Date(blocker.endsAt).getTime() + 15 * 60_000)
    }
  }

  return out
}
