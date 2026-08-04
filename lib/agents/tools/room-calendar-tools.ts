import {
  createRoomCalendarEvent,
  ingestProposedDates,
  listRoomCalendarEvents,
  updateRoomCalendarEvent,
  cancelRoomCalendarEvent,
} from '@/lib/rooms/room-calendar'

function scopeOf(params: Record<string, unknown>) {
  return String(params.scopeId || 'shared-demo')
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
  })
  return {
    ok: true,
    scopeId,
    count: events.length,
    events,
    messageAr:
      events.length === 0
        ? 'تقويم الغرفة فارغ — أضف مواعيد يدوياً أو اطلب من الوكيل دمج تواريخ الموظفين.'
        : `تقويم الغرفة: ${events.length} موعداً مشتركاً للفريق.`,
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
    ...result,
    messageAr:
      result.conflicts.length > 0
        ? `أُضيف مع تنبيه تعارض (${result.conflicts.length}). ${result.suggestion?.messageAr || 'راجع التقويم المشترك.'}`
        : `أُضيف «${result.event.titleAr}» إلى تقويم الغرفة المشترك.`,
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
