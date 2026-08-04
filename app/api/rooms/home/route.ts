import { NextRequest, NextResponse } from 'next/server'
import { listRoomCalendarEvents } from '@/lib/rooms/room-calendar'
import { listRoomTasks } from '@/lib/rooms/room-tasks'
import {
  lastZoomLiveAt,
  listRoomActivity,
  listZoomSessions,
  logRoomActivity,
  upsertZoomLiveSessions,
} from '@/lib/rooms/home-log'
import { getLiveZoomSnapshot } from '@/lib/zoom/live-status'
import { listRoomPosts } from '@/lib/rooms/persist'
import { upcomingSystemDeadlines } from '@/lib/rooms/system-deadlines'
import { isSystemDeadline } from '@/lib/rooms/system-deadlines'

export const dynamic = 'force-dynamic'

const TZ = 'Asia/Riyadh'

function dayBounds(offsetDays: number) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const now = new Date()
  const base = new Date(now.getTime() + offsetDays * 86400_000)
  const ymd = fmt.format(base) // YYYY-MM-DD in Riyadh
  const start = new Date(`${ymd}T00:00:00+03:00`)
  const end = new Date(`${ymd}T23:59:59.999+03:00`)
  return { ymd, startIso: start.toISOString(), endIso: end.toISOString(), start, end }
}

function inRange(iso: string, start: Date, end: Date) {
  const t = new Date(iso).getTime()
  return t >= start.getTime() && t <= end.getTime()
}

function fmtTime(iso: string) {
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

/** Home digest: yesterday / today / tomorrow / week + Zoom + activity. */
export async function GET(req: NextRequest) {
  const scopeId = req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  const yesterday = dayBounds(-1)
  const today = dayBounds(0)
  const tomorrow = dayBounds(1)
  const dayAfter = dayBounds(2)
  const weekStart = dayBounds(0)
  const weekEnd = dayBounds(6)

  const [events, tasks, activity, zoomSessions, posts, zoomSnap, deadlines] =
    await Promise.all([
      listRoomCalendarEvents({
        scopeId,
        from: yesterday.startIso,
        to: weekEnd.endIso,
      }).catch(() => []),
      listRoomTasks(scopeId).catch(() => []),
      listRoomActivity(scopeId, 50),
      listZoomSessions(scopeId, 15),
      listRoomPosts(scopeId, 30).then((r) => r.posts).catch(() => []),
      getLiveZoomSnapshot({ scopeId }).catch(() => null),
      upcomingSystemDeadlines(scopeId, 90).catch(() => []),
    ])

  if (zoomSnap?.meetings) {
    await upsertZoomLiveSessions({
      scopeId,
      meetings: zoomSnap.meetings.map((m) => ({
        id: m.id,
        topic: m.topic,
        joinUrl: m.joinUrl,
        hostEmail: m.hostEmail,
        live: Boolean(m.live && m.source !== 'calendar_window'),
      })),
    }).catch(() => undefined)
  }

  const mapEv = (list: typeof events) =>
    list.map((e) => ({
      id: e.id,
      titleAr: e.titleAr,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      startsAtAr: fmtTime(e.startsAt),
      endsAtAr: fmtTime(e.endsAt),
      locationAr: e.locationAr,
      attendees: e.attendees,
      hasZoom: /zoom\.us/i.test(
        `${e.descriptionAr || ''} ${e.locationAr || ''} ${JSON.stringify(e.meta || {})}`
      ),
      status: e.status,
    }))

  const byDay = {
    yesterday: mapEv(
      events.filter((e) => inRange(e.startsAt, yesterday.start, yesterday.end))
    ),
    today: mapEv(
      events.filter((e) => inRange(e.startsAt, today.start, today.end))
    ),
    tomorrow: mapEv(
      events.filter((e) => inRange(e.startsAt, tomorrow.start, tomorrow.end))
    ),
    dayAfter: mapEv(
      events.filter((e) => inRange(e.startsAt, dayAfter.start, dayAfter.end))
    ),
    week: mapEv(
      events.filter((e) => inRange(e.startsAt, weekStart.start, weekEnd.end))
    ),
  }

  const lastZoom = await lastZoomLiveAt(scopeId)
  const liveZoom = (zoomSnap?.meetings || []).filter(
    (m) => m.live && m.source !== 'calendar_window'
  )
  const zoomLiveNow = liveZoom.length > 0 || (zoomSnap?.liveCount || 0) > 0

  // Presence-ish actors from recent activity
  const peopleMap = new Map<
    string,
    { nameAr: string; email?: string | null; actions: number; lastAt: string; lastAction: string }
  >()
  for (const a of activity) {
    const key = a.actorEmail || a.actorAr
    const prev = peopleMap.get(key)
    if (!prev) {
      peopleMap.set(key, {
        nameAr: a.actorAr,
        email: a.actorEmail,
        actions: 1,
        lastAt: a.createdAt,
        lastAction: a.actionAr,
      })
    } else {
      prev.actions += 1
      if (a.createdAt > prev.lastAt) {
        prev.lastAt = a.createdAt
        prev.lastAction = a.actionAr
      }
    }
  }

  const openTasks = tasks.filter(
    (t) => t.status === 'open' || t.status === 'in_progress'
  )

  const weekEvents = events.filter((e) =>
    inRange(e.startsAt, weekStart.start, weekEnd.end)
  )
  const weekTasks = openTasks.filter((t) => {
    if (!t.dueAt) return true
    return inRange(t.dueAt, weekStart.start, weekEnd.end) || new Date(t.dueAt) < weekEnd.end
  })
  const commitments = [
    ...weekEvents.map((e) => ({
      id: `cal-${e.id}`,
      kind: isSystemDeadline(e) ? ('deadline' as const) : ('event' as const),
      titleAr: e.titleAr,
      whenAt: e.startsAt,
      whenAtAr: fmtTime(e.startsAt),
      detailAr: e.locationAr,
    })),
    ...weekTasks.map((t) => ({
      id: `task-${t.id}`,
      kind: 'task' as const,
      titleAr: t.titleAr,
      whenAt: t.dueAt,
      whenAtAr: t.dueAt ? fmtTime(t.dueAt) : 'بدون موعد',
      detailAr: t.assigneeAr,
    })),
  ].sort((a, b) => {
    const ta = a.whenAt ? new Date(a.whenAt).getTime() : Number.MAX_SAFE_INTEGER
    const tb = b.whenAt ? new Date(b.whenAt).getTime() : Number.MAX_SAFE_INTEGER
    return ta - tb
  })

  return NextResponse.json({
    scopeId,
    timezone: TZ,
    days: {
      yesterday: yesterday.ymd,
      today: today.ymd,
      tomorrow: tomorrow.ymd,
      dayAfter: dayAfter.ymd,
    },
    calendar: byDay,
    commitments: {
      count: commitments.length,
      items: commitments.slice(0, 20),
    },
    systemDeadlines: deadlines.slice(0, 8).map((d) => ({
      id: d.id,
      kind: d.kind,
      labelAr: d.labelAr,
      startsAt: d.startsAt,
      startsAtAr: fmtTime(d.startsAt),
      daysLeft: d.daysLeft,
    })),
    zoom: {
      liveNow: zoomLiveNow,
      liveCount: liveZoom.length || zoomSnap?.liveCount || 0,
      liveMeetings: liveZoom,
      lastLiveAt: lastZoom,
      lastLiveAtAr: lastZoom ? fmtTime(lastZoom) : null,
      recentSessions: zoomSessions.slice(0, 8),
      messageAr: zoomSnap?.messageAr || '',
      configured: Boolean(zoomSnap?.configured),
    },
    activity: activity.slice(0, 25).map((a) => ({
      ...a,
      atAr: fmtTime(a.createdAt),
    })),
    people: [...peopleMap.values()]
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
      .slice(0, 12)
      .map((p) => ({
        ...p,
        lastAtAr: fmtTime(p.lastAt),
      })),
    tasks: {
      openCount: openTasks.length,
      items: openTasks.slice(0, 8).map((t) => ({
        id: t.id,
        titleAr: t.titleAr,
        dueAt: t.dueAt,
        status: t.status,
        assigneeAr: t.assigneeAr,
      })),
    },
    recentPosts: posts.slice(-8).reverse().map((p) => ({
      id: p.id,
      authorAr: p.authorNameAr,
      kind: p.authorKind,
      content: p.content.slice(0, 140),
      at: p.createdAt,
      atAr: fmtTime(new Date(p.createdAt).toISOString()),
    })),
    messageAr: 'لوحة اليوم — ماذا حدث وماذا سيحدث · التزامات هذا الأسبوع.',
  })
}

/** Log presence / manual activity from the client. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    kind?: string
    actorAr?: string
    actorEmail?: string
    actionAr?: string
    detailAr?: string
  }
  const scopeId = String(body.scopeId || 'shared-demo')
  const row = await logRoomActivity({
    scopeId,
    kind:
      body.kind === 'presence' ||
      body.kind === 'edit' ||
      body.kind === 'message' ||
      body.kind === 'canvas' ||
      body.kind === 'zoom' ||
      body.kind === 'system'
        ? body.kind
        : 'presence',
    actorAr: String(body.actorAr || 'مجهول'),
    actorEmail: body.actorEmail || null,
    actionAr: String(body.actionAr || 'تواجد في الغرفة'),
    detailAr: body.detailAr || null,
  })
  return NextResponse.json({ ok: true, row })
}
