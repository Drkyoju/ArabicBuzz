import { NextRequest, NextResponse } from 'next/server'
import { isSyntheticIdentity } from '@/lib/auth/synthetic'
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

function dayLabelAr(offset: number): string {
  if (offset === 0) return 'اليوم'
  if (offset === 1) return 'غداً'
  if (offset === 2) return 'بعد غد'
  return `بعد ${offset} أيام`
}

function weekdayAr(ymd: string): string {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: TZ,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${ymd}T12:00:00+03:00`))
  } catch {
    return ymd
  }
}

/** نهاية الشهر الحالي بتوقيت الرياض */
function endOfRiyadhMonth(fromYmd: string) {
  const [y, m] = fromYmd.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const endYmd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const end = new Date(`${endYmd}T23:59:59.999+03:00`)
  return { ymd: endYmd, end, endIso: end.toISOString() }
}

/** Home digest: today / tomorrow / rest of month + Zoom + activity. */
export async function GET(req: NextRequest) {
  const { requireSessionUser } = await import('@/lib/auth/session')
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const scopeId = req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  const yesterday = dayBounds(-1)
  const today = dayBounds(0)
  const tomorrow = dayBounds(1)
  const dayAfter = dayBounds(2)
  const monthEnd = endOfRiyadhMonth(today.ymd)
  const weekStart = dayBounds(0)
  const weekEnd = dayBounds(6)
  // اليوم + غداً فقط كلوحات كبيرة
  const agendaBounds = [today, tomorrow]

  const [
    events,
    allBeyondMonth,
    tasks,
    activity,
    zoomSessions,
    posts,
    zoomSnap,
    deadlines,
  ] = await Promise.all([
    listRoomCalendarEvents({
      scopeId,
      from: yesterday.startIso,
      to: monthEnd.endIso,
    }).catch(() => []),
    listRoomCalendarEvents({
      scopeId,
      from: new Date(monthEnd.end.getTime() + 1).toISOString(),
    }).catch(() => []),
    listRoomTasks(scopeId).catch(() => []),
    listRoomActivity(scopeId, 120),
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
      source: e.source,
      createdByAr: e.createdByAr,
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

  const agenda = agendaBounds.map((d, offset) => ({
    offset,
    ymd: d.ymd,
    labelAr: dayLabelAr(offset),
    weekdayAr: weekdayAr(d.ymd),
    events: mapEv(
      events.filter((e) => inRange(e.startsAt, d.start, d.end))
    ),
  }))

  // باقي الشهر بعد غد — أيام فيها مواعيد فقط
  const monthRestByYmd = new Map<
    string,
    ReturnType<typeof mapEv>
  >()
  for (const e of events) {
    const ymd = e.startsAt
      ? new Intl.DateTimeFormat('en-CA', {
          timeZone: TZ,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(e.startsAt))
      : ''
    if (!ymd || ymd <= tomorrow.ymd) continue
    if (ymd > monthEnd.ymd) continue
    const mapped = mapEv([e])[0]
    const list = monthRestByYmd.get(ymd) || []
    list.push(mapped)
    monthRestByYmd.set(ymd, list)
  }
  const monthRest = Array.from(monthRestByYmd.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ymd, list], i) => ({
      offset: 2 + i,
      ymd,
      labelAr: weekdayAr(ymd),
      weekdayAr: weekdayAr(ymd),
      events: list,
    }))

  const beyondMonthCount = allBeyondMonth.filter(
    (e) => e.status !== 'cancelled'
  ).length

  const lastZoom = await lastZoomLiveAt(scopeId)
  const liveZoom = (zoomSnap?.meetings || []).filter(
    (m) => m.live && m.source !== 'calendar_window'
  )
  const zoomLiveNow = liveZoom.length > 0

  // Meaningful actors only — skip presence page-opens («فتح لوحة اليوم»)
  const meaningfulActivity = activity.filter(
    (a) =>
      a.kind !== 'presence' &&
      a.actionAr !== 'فتح لوحة اليوم' &&
      a.actionAr !== 'تواجد في الغرفة'
  )
  const peopleMap = new Map<
    string,
    { nameAr: string; email?: string | null; actions: number; lastAt: string; lastAction: string }
  >()
  for (const a of meaningfulActivity) {
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
    agenda,
    monthRest,
    beyondMonthCount,
    monthYm: today.ymd.slice(0, 7),
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
      liveCount: liveZoom.length,
      scheduledNowCount: zoomSnap?.scheduledNowCount || 0,
      liveMeetings: liveZoom,
      lastLiveAt: lastZoom,
      lastLiveAtAr: lastZoom ? fmtTime(lastZoom) : null,
      recentSessions: zoomSessions.slice(0, 8),
      messageAr: zoomSnap?.messageAr || '',
      configured: Boolean(zoomSnap?.configured),
    },
    activity: meaningfulActivity.slice(0, 80).map((a) => ({
      id: a.id,
      kind: a.kind,
      actorAr: a.actorAr,
      actorEmail: a.actorEmail,
      actionAr: a.actionAr,
      detailAr: a.detailAr,
      createdAt: a.createdAt,
      atAr: fmtTime(a.createdAt),
    })),
    people: [...peopleMap.values()]
      .filter((p) => !isSyntheticIdentity({ email: p.email }))
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
    recentPosts: posts.slice(-24).reverse().map((p) => ({
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

/** Log manual activity from the client (presence page-opens are ignored). */
export async function POST(req: NextRequest) {
  const { requireRealUser } = await import('@/lib/auth/session')
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    kind?: string
    actorAr?: string
    actorEmail?: string
    actionAr?: string
    detailAr?: string
  }
  const kind =
    body.kind === 'presence' ||
    body.kind === 'edit' ||
    body.kind === 'message' ||
    body.kind === 'canvas' ||
    body.kind === 'zoom' ||
    body.kind === 'system'
      ? body.kind
      : 'presence'
  const actionAr = String(body.actionAr || 'تواجد في الغرفة')
  // Do not persist home page-open noise into the activity feed
  if (
    kind === 'presence' ||
    actionAr === 'فتح لوحة اليوم' ||
    actionAr === 'تواجد في الغرفة'
  ) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'presence_ignored' })
  }
  const scopeId = String(body.scopeId || 'shared-demo')
  const row = await logRoomActivity({
    scopeId,
    kind,
    actorAr: String(
      body.actorAr ||
        auth.user.user_metadata?.full_name ||
        auth.user.email ||
        'عضو'
    ),
    actorEmail: body.actorEmail || auth.user.email || null,
    actionAr,
    detailAr: body.detailAr || null,
  })
  return NextResponse.json({ ok: true, row })
}
