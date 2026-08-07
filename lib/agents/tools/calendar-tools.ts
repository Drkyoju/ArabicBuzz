import {
  createCalendarEvent,
  deleteCalendarEvent,
  extractConferenceUrl,
  findConflictsForProposal,
  findDuplicateAppointments,
  findDuplicateGroups,
  findMutualFreeSlots,
  listLinkedCalendarEmails,
  listUpcomingEvents,
  scanEmailForMeetings,
  updateCalendarEvent,
} from '@/lib/google/calendar'
import { createZoomMeeting, isZoomCreateConfigured } from '@/lib/zoom/create-meeting'

function userIdOf(params: Record<string, unknown>) {
  return String(params.userId || params._userId || '').trim()
}

function requireUser(params: Record<string, unknown>) {
  const userId = userIdOf(params)
  if (!userId || userId === 'engine') {
    throw new Error(
      'يلزم تسجيل الدخول وربط التقويم من قسم «التقويم · Zoom» أولاً.'
    )
  }
  return userId
}

function emailsOf(params: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(params.emails)) {
    return params.emails.map(String).filter(Boolean)
  }
  if (params.email || params.accountEmail) {
    return [String(params.email || params.accountEmail)]
  }
  return undefined
}

export async function executeCalendarList(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const max = Number(params.maxResults || 40)
  const emails = emailsOf(params)
  const accounts = await listLinkedCalendarEmails(userId)
  const events = await listUpcomingEvents(userId, {
    maxResults: max,
    query: params.query ? String(params.query) : undefined,
    emails,
  })
  const groups = findDuplicateGroups(events)
  return {
    ok: true,
    source: 'google_personal',
    isTeamCalendar: false,
    count: events.length,
    accounts: accounts.map((a) => a.email),
    events,
    duplicates: groups,
    duplicateGroups: groups.length,
    messageAr:
      events.length === 0
        ? `لا مواعيد قادمة عبر ${accounts.length || 0} حساب Google شخصي مربوط. لأجندة الفريق استخدم تقويم الغرفة (room_calendar_list).`
        : groups.length > 0
          ? `تقويم Google الشخصي: ${events.length} موعداً من ${accounts.length} بريد — و${groups.length} مجموعة تكرار/تعارض. هذه ليست مواعيد تقويم الغرفة المشترك.`
          : `تقويم Google الشخصي: ${events.length} موعداً من ${accounts.length} بريد مربوط — ليست أجندة الفريق. استخدم room_calendar_list لمواعيد الغرفة.`,
  }
}

export async function executeCalendarFindAlignment(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const emails = emailsOf(params)
  const guestEmails = Array.isArray(params.guestEmails)
    ? params.guestEmails.map(String).filter((e) => e.includes('@'))
    : Array.isArray(params.attendeeEmails)
      ? params.attendeeEmails.map(String).filter((e) => e.includes('@'))
      : undefined
  const result = await findMutualFreeSlots(userId, {
    emails,
    guestEmails,
    timeMinIso: params.timeMinIso ? String(params.timeMinIso) : undefined,
    timeMaxIso: params.timeMaxIso ? String(params.timeMaxIso) : undefined,
    durationMinutes: Number(params.durationMinutes || 60),
    timeZone: params.timeZone ? String(params.timeZone) : 'Asia/Riyadh',
    workdayStartHour:
      typeof params.workdayStartHour === 'number'
        ? params.workdayStartHour
        : 9,
    workdayEndHour:
      typeof params.workdayEndHour === 'number' ? params.workdayEndHour : 17,
    maxSlots: Number(params.maxSlots || 12),
  })
  return { ok: true, ...result }
}

export async function executeCalendarFindDuplicates(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const result = await findDuplicateAppointments(userId, {
    maxResults: Number(params.maxResults || 40),
  })
  return {
    ok: true,
    ...result,
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
  let conferenceUrl = conf

  const remindersRaw = params.reminderMinutes
  const reminderMinutes = Array.isArray(remindersRaw)
    ? remindersRaw.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : [30, 60]

  const force = params.force === true || params.allowDuplicate === true
  const upcoming = await listUpcomingEvents(userId, { maxResults: 40 })
  const conflicts = findConflictsForProposal(upcoming, {
    summary,
    startIso,
    endIso,
    conferenceUrl: conf,
  })
  if (conflicts.length > 0 && !force) {
    return {
      ok: false,
      blocked: true,
      conflicts,
      messageAr:
        `لم يُضف الموعد: يوجد ${conflicts.length} تعارض/تكرار محتمل. راجع المجموعات أو أعد الطلب مع allowDuplicate=true إن كنت متأكداً.`,
    }
  }

  const accountEmail = params.accountEmail
    ? String(params.accountEmail)
    : params.email
      ? String(params.email)
      : undefined

  if (!conferenceUrl && isZoomCreateConfigured()) {
    try {
      const durationMinutes = Math.max(
        15,
        Math.round(
          (Date.parse(endIso) - Date.parse(startIso)) / (60 * 1000)
        ) || 60
      )
      const zoom = await createZoomMeeting({
        topic: summary,
        startIso,
        durationMinutes,
        agenda: params.description ? String(params.description) : undefined,
      })
      conferenceUrl = zoom.joinUrl
    } catch (e) {
      console.warn(
        '[calendar-tools] zoom autolink failed',
        e instanceof Error ? e.message : e
      )
    }
  }

  const event = await createCalendarEvent(userId, {
    summary,
    description: params.description ? String(params.description) : undefined,
    location: params.location ? String(params.location) : undefined,
    startIso,
    endIso,
    timeZone: params.timeZone ? String(params.timeZone) : 'Asia/Riyadh',
    conferenceUrl,
    attendeeEmails: Array.isArray(params.attendeeEmails)
      ? params.attendeeEmails.map(String).filter((e) => e.includes('@'))
      : Array.isArray(params.guestEmails)
        ? params.guestEmails.map(String).filter((e) => e.includes('@'))
        : undefined,
    reminderMinutes,
    accountEmail,
  })
  return {
    ok: true,
    event,
    conflictsIgnored: force ? conflicts : [],
    messageAr: `أُضيف «${event.summary}» إلى تقويم ${event.accountEmail || 'Google'}${conferenceUrl ? ' مع رابط الاجتماع' : ''}${
      force && conflicts.length
        ? ' (تم التجاهل رغم تعارض محتمل)'
        : ''
    }.`,
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
