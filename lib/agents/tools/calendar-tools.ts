import {
  createCalendarEvent,
  deleteCalendarEvent,
  extractConferenceUrl,
  listUpcomingEvents,
  scanEmailForMeetings,
  updateCalendarEvent,
} from '@/lib/google/calendar'

function userIdOf(params: Record<string, unknown>) {
  return String(params.userId || params._userId || '').trim()
}

function requireUser(params: Record<string, unknown>) {
  const userId = userIdOf(params)
  if (!userId || userId === 'local-owner' || userId === 'engine') {
    throw new Error(
      'يلزم تسجيل الدخول بـ Google وربط التقويم من الإعدادات أولاً.'
    )
  }
  return userId
}

export async function executeCalendarList(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const events = await listUpcomingEvents(userId, {
    maxResults: Number(params.maxResults || 15),
    query: params.query ? String(params.query) : undefined,
  })
  return {
    ok: true,
    count: events.length,
    events,
    messageAr:
      events.length === 0
        ? 'لا مواعيد قادمة في التقويم الأساسي.'
        : `وُجد ${events.length} موعداً قادماً.`,
  }
}

export async function executeCalendarCreate(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const summary = String(params.summary || params.titleAr || '').trim()
  const startIso = String(params.startIso || params.start || '').trim()
  const endIso = String(params.endIso || params.end || '').trim()
  if (!summary || !startIso || !endIso) {
    throw new Error('يلزم summary و startIso و endIso (ISO-8601).')
  }
  const conf: string | undefined =
    (params.conferenceUrl ? String(params.conferenceUrl) : undefined) ||
    (params.zoomUrl ? String(params.zoomUrl) : undefined) ||
    extractConferenceUrl(String(params.description || '')) ||
    undefined

  const remindersRaw = params.reminderMinutes
  const reminderMinutes = Array.isArray(remindersRaw)
    ? remindersRaw.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : [30, 60]

  const event = await createCalendarEvent(userId, {
    summary,
    description: params.description ? String(params.description) : undefined,
    location: params.location ? String(params.location) : undefined,
    startIso,
    endIso,
    timeZone: params.timeZone ? String(params.timeZone) : 'Asia/Riyadh',
    conferenceUrl: conf,
    attendeeEmails: Array.isArray(params.attendeeEmails)
      ? params.attendeeEmails.map(String)
      : undefined,
    reminderMinutes,
  })
  return {
    ok: true,
    event,
    messageAr: `أُضيف «${event.summary}» إلى تقويم Google${conf ? ' مع رابط الاجتماع' : ''}.`,
  }
}

export async function executeCalendarUpdate(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const eventId = String(params.eventId || '').trim()
  if (!eventId) throw new Error('يلزم eventId')
  const event = await updateCalendarEvent(userId, eventId, {
    summary: params.summary ? String(params.summary) : undefined,
    description: params.description ? String(params.description) : undefined,
    location: params.location ? String(params.location) : undefined,
    startIso: params.startIso ? String(params.startIso) : undefined,
    endIso: params.endIso ? String(params.endIso) : undefined,
    timeZone: params.timeZone ? String(params.timeZone) : undefined,
    conferenceUrl:
      (params.conferenceUrl ? String(params.conferenceUrl) : undefined) ||
      (params.zoomUrl ? String(params.zoomUrl) : undefined) ||
      undefined,
    reminderMinutes: Array.isArray(params.reminderMinutes)
      ? params.reminderMinutes.map((n) => Number(n))
      : undefined,
  })
  return {
    ok: true,
    event,
    messageAr: `حُدّث الموعد «${event.summary}» في تقويم Google.`,
  }
}

export async function executeCalendarDelete(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const eventId = String(params.eventId || '').trim()
  if (!eventId) throw new Error('يلزم eventId')
  const result = await deleteCalendarEvent(userId, eventId)
  return {
    ok: true,
    ...result,
    messageAr: 'حُذف الموعد من تقويم Google.',
  }
}

export async function executeCalendarScanEmail(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const meetings = await scanEmailForMeetings(userId, {
    maxResults: Number(params.maxResults || 12),
  })
  return {
    ok: true,
    count: meetings.length,
    meetings,
    messageAr:
      meetings.length === 0
        ? 'لا دعوات اجتماع واضحة في البريد الأخير.'
        : `عُثر على ${meetings.length} رسالة قد تحتوي دعوات/Zoom — راجعها ثم أنشئ الموعد بأداة الإضافة.`,
  }
}
