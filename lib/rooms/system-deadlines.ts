/**
 * Association compliance deadlines on the shared room calendar.
 * Kinds: license expiry, general assembly, annual report.
 */
import {
  createRoomCalendarEvent,
  listRoomCalendarEvents,
  updateRoomCalendarEvent,
  type RoomCalendarEvent,
} from '@/lib/rooms/room-calendar'

export const SYSTEM_DEADLINE_KINDS = [
  'license_expiry',
  'general_assembly',
  'annual_report',
] as const

export type SystemDeadlineKind = (typeof SYSTEM_DEADLINE_KINDS)[number]

export const SYSTEM_DEADLINE_LABELS_AR: Record<SystemDeadlineKind, string> = {
  license_expiry: 'انتهاء ترخيص الجمعية',
  general_assembly: 'الجمعية العمومية',
  annual_report: 'التقرير السنوي',
}

export function isSystemDeadline(ev: RoomCalendarEvent): boolean {
  const k = ev.meta?.deadlineKind
  return (
    typeof k === 'string' &&
    (SYSTEM_DEADLINE_KINDS as readonly string[]).includes(k)
  )
}

export function deadlineKindOf(ev: RoomCalendarEvent): SystemDeadlineKind | null {
  const k = ev.meta?.deadlineKind
  if (
    typeof k === 'string' &&
    (SYSTEM_DEADLINE_KINDS as readonly string[]).includes(k)
  ) {
    return k as SystemDeadlineKind
  }
  return null
}

/** All-day window in Asia/Riyadh for a YYYY-MM-DD date. */
export function riyadhAllDayRange(ymd: string): { startsAt: string; endsAt: string } {
  const start = new Date(`${ymd}T00:00:00+03:00`)
  const end = new Date(`${ymd}T23:59:59.999+03:00`)
  return { startsAt: start.toISOString(), endsAt: end.toISOString() }
}

export async function listSystemDeadlines(
  scopeId: string
): Promise<RoomCalendarEvent[]> {
  const events = await listRoomCalendarEvents({ scopeId })
  return events
    .filter((e) => e.status !== 'cancelled' && isSystemDeadline(e))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

export async function upsertSystemDeadline(opts: {
  scopeId: string
  kind: SystemDeadlineKind
  /** YYYY-MM-DD in Riyadh */
  dateYmd: string
  notesAr?: string
  createdBy?: string
  createdByAr?: string
}): Promise<{ event: RoomCalendarEvent; created: boolean; messageAr: string }> {
  const kind = opts.kind
  const label = SYSTEM_DEADLINE_LABELS_AR[kind]
  const { startsAt, endsAt } = riyadhAllDayRange(opts.dateYmd)
  const existing = await listSystemDeadlines(opts.scopeId)
  const hit = existing.find((e) => deadlineKindOf(e) === kind)

  const meta = {
    deadlineKind: kind,
    reminderDays: [30, 14, 7, 1],
    system: true,
  }

  if (hit) {
    const { event } = await updateRoomCalendarEvent(hit.id, opts.scopeId, {
      titleAr: label,
      descriptionAr: opts.notesAr?.trim() || hit.descriptionAr,
      startsAt,
      endsAt,
      allDay: true,
      meta: { ...hit.meta, ...meta },
      status: 'confirmed',
    })
    return {
      event,
      created: false,
      messageAr: `حُدّث تذكير «${label}» إلى ${opts.dateYmd}`,
    }
  }

  const { event } = await createRoomCalendarEvent({
    scopeId: opts.scopeId,
    titleAr: label,
    descriptionAr:
      opts.notesAr?.trim() ||
      `موعد نظامي للجمعية — تذكيرات قبل 30 و14 و7 و1 يوم.`,
    startsAt,
    endsAt,
    allDay: true,
    source: 'manual',
    createdBy: opts.createdBy,
    createdByAr: opts.createdByAr || 'النظام',
    meta,
  })
  return {
    event,
    created: true,
    messageAr: `أُضيف تذكير «${label}» في ${opts.dateYmd} على التقويم المشترك`,
  }
}

/** Upcoming deadlines within N days (default 60). */
export async function upcomingSystemDeadlines(
  scopeId: string,
  withinDays = 60
): Promise<
  Array<
    RoomCalendarEvent & {
      kind: SystemDeadlineKind
      daysLeft: number
      labelAr: string
    }
  >
> {
  const now = Date.now()
  const horizon = now + withinDays * 86400_000
  const list = await listSystemDeadlines(scopeId)
  return list
    .map((e) => {
      const kind = deadlineKindOf(e)!
      const t = new Date(e.startsAt).getTime()
      const daysLeft = Math.ceil((t - now) / 86400_000)
      return {
        ...e,
        kind,
        daysLeft,
        labelAr: SYSTEM_DEADLINE_LABELS_AR[kind],
      }
    })
    .filter((e) => {
      const t = new Date(e.startsAt).getTime()
      return t <= horizon
    })
}
