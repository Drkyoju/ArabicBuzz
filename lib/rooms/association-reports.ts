/**
 * Association reports from room DB: members + attendance/activity.
 */
import { listRoomMembers } from '@/lib/rooms/persist'
import { listRoomActivity, listZoomSessions } from '@/lib/rooms/home-log'
import { listRoomCalendarEvents } from '@/lib/rooms/room-calendar'

export async function reportRoomMembersAttendance(opts: {
  scopeId: string
  days?: number
}) {
  const scopeId = opts.scopeId || 'shared-demo'
  const days = Math.min(90, Math.max(1, opts.days || 14))
  const since = Date.now() - days * 86400_000

  const [membersRes, activity, events, zoom] = await Promise.all([
    listRoomMembers(scopeId),
    listRoomActivity(scopeId, 200),
    listRoomCalendarEvents({
      scopeId,
      from: new Date(since).toISOString(),
      to: new Date().toISOString(),
    }),
    listZoomSessions(scopeId, 30),
  ])

  const recentActivity = activity.filter(
    (a) => new Date(a.createdAt).getTime() >= since
  )

  const byActor = new Map<
    string,
    {
      nameAr: string
      email: string | null
      actions: number
      kinds: Record<string, number>
    }
  >()
  for (const a of recentActivity) {
    const key = a.actorEmail || a.actorAr
    const row = byActor.get(key) || {
      nameAr: a.actorAr,
      email: a.actorEmail,
      actions: 0,
      kinds: {},
    }
    row.actions += 1
    row.kinds[a.kind] = (row.kinds[a.kind] || 0) + 1
    byActor.set(key, row)
  }

  const memberRows = membersRes.members.map((m) => {
    const key = m.email || m.displayNameAr
    const act = byActor.get(key || m.displayNameAr)
    return {
      id: m.id,
      nameAr: m.displayNameAr,
      email: m.email,
      role: m.role,
      actionsLastDays: act?.actions || 0,
      activityBreakdown: act?.kinds || {},
    }
  })

  const meetings = events.filter((e) => e.status !== 'cancelled')
  const liveOrPastZoom = zoom.filter(
    (z) => new Date(z.lastSeenAt).getTime() >= since
  )

  const summaryAr = [
    `أعضاء الغرفة: ${memberRows.length}`,
    `إجراءات آخر ${days} يوماً: ${recentActivity.length}`,
    `مواعيد في الفترة: ${meetings.length}`,
    `جلسات Zoom مسجّلة: ${liveOrPastZoom.length}`,
    `نشطون (لهم إجراء): ${[...byActor.values()].filter((a) => a.actions > 0).length}`,
  ].join(' · ')

  return {
    ok: true,
    scopeId,
    days,
    summaryAr,
    members: memberRows,
    topActors: [...byActor.values()]
      .sort((a, b) => b.actions - a.actions)
      .slice(0, 15),
    meetingsCount: meetings.length,
    zoomSessions: liveOrPastZoom.map((z) => ({
      topic: z.topic,
      live: z.live,
      startedAt: z.startedAt,
      lastSeenAt: z.lastSeenAt,
      endedAt: z.endedAt,
    })),
    messageAr: summaryAr,
  }
}
