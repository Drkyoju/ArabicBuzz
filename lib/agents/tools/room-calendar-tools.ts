import {
  createRoomCalendarEvent,
  ingestProposedDates,
  listRoomCalendarEvents,
  reconcileRoomCalendar,
  updateRoomCalendarEvent,
  cancelRoomCalendarEvent,
} from '@/lib/rooms/room-calendar'
import { teamCalendarScopeId } from '@/lib/scopes/team-calendar-scope'

const TZ = 'Asia/Riyadh'

function scopeOf(params: Record<string, unknown>) {
  // Agents / Telegram: never write team agenda onto a personal desk.
  return teamCalendarScopeId(String(params.scopeId || ''))
}

function formatRiyadhRange(
  startsAt: string,
  endsAt: string,
  allDay?: boolean
): string {
  if (allDay) return 'طوال اليوم'
  try {
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }
    const s = new Date(startsAt).toLocaleTimeString('ar-SA', opts)
    const e = new Date(endsAt).toLocaleTimeString('ar-SA', opts)
    return `${s}–${e}`
  } catch {
    return ''
  }
}

export async function executeRoomCalendarList(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const events = await listRoomCalendarEvents({
    scopeId,
    from: params.from ? String(params.from) : undefined,
    to: params.to ? String(params.to) : undefined,
    // Match getRoomAgenda / home / Telegram — hide QA noise by default.
    hideTestTitles: params.hideTestTitles !== false,
  })
  const formatted = events.map((e) => ({
    id: e.id,
    titleAr: e.titleAr,
    whenAr: formatRiyadhRange(e.startsAt, e.endsAt, e.allDay),
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    allDay: e.allDay,
    status: e.status,
    timeZone: TZ,
  }))
  return {
    ok: true,
    scopeId,
    count: events.length,
    timeZone: TZ,
    events: formatted,
    /** Pre-formatted lines for the model — use whenAr as-is; do not re-convert to UTC. */
    linesAr: formatted.map((e) =>
      e.whenAr ? `• ${e.whenAr} — ${e.titleAr}` : `• ${e.titleAr}`
    ),
    messageAr:
      events.length === 0
        ? 'تقويم الغرفة فارغ — لا مواعيد مشتركة مسجّلة. لا تختلق مواعيد؛ أضف موعداً يدوياً أو عبر room_calendar_create.'
        : `تقويم الغرفة: ${events.length} موعداً مشتركاً للفريق (توقيت السعودية ${TZ}).`,
  }
}

export async function executeRoomCalendarCreate(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const result = await createRoomCalendarEvent({
    scopeId,
    titleAr: String(params.titleAr || params.title || ''),
    descriptionAr: params.descriptionAr
      ? String(params.descriptionAr)
      : undefined,
    startsAt: String(params.startsAt || params.start || ''),
    endsAt: String(params.endsAt || params.end || ''),
    allDay: Boolean(params.allDay),
    locationAr: params.locationAr ? String(params.locationAr) : undefined,
    attendees: Array.isArray(params.attendees)
      ? params.attendees.map(String)
      : undefined,
    source: 'ai',
    createdBy: String(params.userId || 'agent'),
    createdByAr: 'الوكيل',
  })
  return {
    ok: true,
    created: true,
    eventId: result.event.id,
    ...result,
    messageAr:
      result.conflicts.length > 0
        ? `تم إنشاء الموعد «${result.event.titleAr}» في تقويم الغرفة (ظاهر للفريق). تنبيه فقط: ${result.conflicts.length} تعارض زمني محتمل — ${result.suggestion?.messageAr || 'راجع التقويم إن لزم.'}`
        : `أُضيف «${result.event.titleAr}» إلى تقويم الغرفة المشترك وهو ظاهر للفريق الآن.`,
  }
}

export async function executeRoomCalendarIngest(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const raw = Array.isArray(params.proposals) ? params.proposals : []
  const proposals = raw.map((p) => {
    const row = (p || {}) as Record<string, unknown>
    return {
      titleAr: String(row.titleAr || row.title || 'موعد'),
      startsAt: String(row.startsAt || row.start || ''),
      endsAt: String(row.endsAt || row.end || ''),
      fromEmail: row.fromEmail ? String(row.fromEmail) : undefined,
      notesAr: row.notesAr ? String(row.notesAr) : undefined,
    }
  })
  const result = await ingestProposedDates({
    scopeId,
    proposals,
    createdBy: String(params.userId || 'agent'),
    createdByAr: 'الوكيل · دمج تواريخ',
  })
  return {
    ok: true,
    ...result,
    messageAr: `دُمجت المواعيد في تقويم الغرفة: ${result.created.length} جديد، ${result.adjusted.length} مُعدَّل زمنياً، ${result.skipped.length} متخطى.`,
  }
}

export async function executeRoomCalendarUpdate(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const eventId = String(params.eventId || params.id || '')
  if (!eventId) throw new Error('يلزم eventId')
  const result = await updateRoomCalendarEvent(eventId, scopeId, {
    titleAr: params.titleAr ? String(params.titleAr) : undefined,
    startsAt: params.startsAt ? String(params.startsAt) : undefined,
    endsAt: params.endsAt ? String(params.endsAt) : undefined,
    descriptionAr:
      params.descriptionAr !== undefined
        ? String(params.descriptionAr)
        : undefined,
    status:
      params.status === 'cancelled' ||
      params.status === 'tentative' ||
      params.status === 'confirmed'
        ? params.status
        : undefined,
  })
  return {
    ok: true,
    ...result,
    messageAr: 'حُدّث موعد تقويم الغرفة.',
  }
}

export async function executeRoomCalendarCancel(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const eventId = String(params.eventId || params.id || '')
  if (!eventId) throw new Error('يلزم eventId')
  const result = await cancelRoomCalendarEvent(eventId, scopeId)
  return {
    ok: true,
    ...result,
    messageAr: 'أُلغي الموعد من لوحة التقويم المشتركة.',
  }
}

export async function executeRoomCalendarReconcile(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const result = await reconcileRoomCalendar({
    scopeId,
    autoAdjust: Boolean(params.autoAdjust),
    notify: params.notify !== false,
  })
  const titleDupes = result.duplicates.filter(
    (d) => d.kind === 'exact_copy' || d.kind === 'same_title_near_time'
  )
  return {
    ok: true,
    scopeId,
    count: result.events.length,
    conflictCount: result.conflicts.length,
    duplicateCount: result.duplicates.length,
    adjusted: result.adjusted,
    conflicts: result.conflicts,
    duplicates: result.duplicates,
    events: result.events.map((e) => ({
      id: e.id,
      titleAr: e.titleAr,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      status: e.status,
    })),
    messageAr:
      result.conflicts.length === 0 && titleDupes.length === 0
        ? 'سبورة التقويم بلا تعارضات أو تكرار ظاهر.'
        : result.adjusted.length > 0
          ? `وُجد ${result.conflicts.length} تعارضاً — عُدّل ${result.adjusted.length} موعداً.${titleDupes.length ? ` و${titleDupes.length} تكرار للمراجعة.` : ''}`
          : result.conflicts.length > 0
            ? `وُجد ${result.conflicts.length} تعارضاً زمنياً${titleDupes.length ? ` و${titleDupes.length} تكرار` : ''} — مرّر autoAdjust=true لإزاحة المواعيد المتعارضة.`
            : `وُجد ${titleDupes.length} مجموعة تكرار محتمل — ألغِ أو عدّل النسخ الزائدة على السبورة.`,
  }
}
