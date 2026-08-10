/**
 * One-way Zoom API → team room calendar.
 * Creates room events for Zoom-scheduled meetings not already on the team calendar.
 * Bidirectional full sync is not available without Zoom webhooks + write-back scopes;
 * calendar→Zoom already works via createZoomMeeting when booking from tools.
 */
import {
  createRoomCalendarEvent,
  listRoomCalendarEvents,
} from '@/lib/rooms/room-calendar'
import { teamCalendarScopeId } from '@/lib/scopes/team-calendar-scope'
import { formatZoomTopicAr } from '@/lib/zoom/topic-ar'
import {
  getUpcomingZoomSnapshot,
  type UpcomingZoomMeeting,
} from '@/lib/zoom/upcoming'

function alreadyOnTeam(
  meeting: UpcomingZoomMeeting,
  existing: Awaited<ReturnType<typeof listRoomCalendarEvents>>
): boolean {
  const join = (meeting.joinUrl || '').trim()
  const mid = String(meeting.id || '')
  for (const ev of existing) {
    if (ev.status === 'cancelled') continue
    const meta = ev.meta || {}
    if (meta.zoomMeetingId && String(meta.zoomMeetingId) === mid) return true
    if (join && (String(meta.zoomUrl || meta.joinUrl || '') === join)) return true
    const blob = `${ev.descriptionAr || ''} ${ev.locationAr || ''}`
    if (join && blob.includes(join)) return true
    if (mid && blob.includes(mid)) return true
  }
  return false
}

export async function syncZoomMeetingsToTeamCalendar(opts: {
  scopeId?: string
  createdBy?: string
  createdByAr?: string
  /** Sync a single Zoom meeting id (from upcoming list). */
  meetingId?: string
}): Promise<{
  ok: boolean
  created: number
  skipped: number
  scopeId: string
  messageAr: string
  eventIds: string[]
}> {
  const scopeId = teamCalendarScopeId(opts.scopeId)
  const snap = await getUpcomingZoomSnapshot({ scopeId })
  let candidates = snap.meetings.filter((m) => m.source === 'zoom_api')
  if (opts.meetingId) {
    candidates = candidates.filter((m) => String(m.id) === String(opts.meetingId))
  }

  const existing = await listRoomCalendarEvents({
    scopeId,
    from: new Date(Date.now() - 60 * 60_000).toISOString(),
    to: new Date(Date.now() + 60 * 86400_000).toISOString(),
    hideTestTitles: false,
  }).catch(() => [])

  let created = 0
  let skipped = 0
  const eventIds: string[] = []

  for (const m of candidates) {
    if (!m.startTime) {
      skipped += 1
      continue
    }
    if (alreadyOnTeam(m, existing)) {
      skipped += 1
      continue
    }
    const start = new Date(m.startTime)
    const mins = m.durationMinutes && m.durationMinutes > 0 ? m.durationMinutes : 60
    const end = new Date(start.getTime() + mins * 60_000)
    const topic = formatZoomTopicAr(m.topic)
    const join = m.joinUrl || ''
    try {
      const { event } = await createRoomCalendarEvent({
        scopeId,
        titleAr: topic,
        descriptionAr: join
          ? `اجتماع Zoom\n${join}`
          : 'اجتماع Zoom من الحساب المرتبط',
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        locationAr: join || 'Zoom',
        source: 'import',
        createdBy: opts.createdBy,
        createdByAr: opts.createdByAr || 'مزامنة Zoom',
        quiet: true,
        meta: {
          zoomMeetingId: m.id,
          zoomUrl: join || null,
          joinUrl: join || null,
          syncedFrom: 'zoom_api',
        },
      })
      created += 1
      eventIds.push(event.id)
      existing.push(event)
    } catch {
      skipped += 1
    }
  }

  const messageAr =
    created === 0
      ? skipped > 0
        ? 'لا مواعيد Zoom جديدة — الكل موجود في تقويم الفريق أو بلا وقت بدء.'
        : snap.configured
          ? 'لا اجتماعات Zoom مجدولة للإضافة.'
          : 'Zoom غير مضبوط — اربط الحساب من الإعدادات.'
      : `أُضيف ${created} موعد Zoom إلى تقويم الفريق${skipped ? ` · تُخطّي ${skipped}` : ''}.`

  return {
    ok: true,
    created,
    skipped,
    scopeId,
    messageAr,
    eventIds,
  }
}
