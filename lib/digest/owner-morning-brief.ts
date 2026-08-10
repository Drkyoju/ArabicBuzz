/**
 * Owner morning brief: org mail + TG highlights + calendar conflicts + overdue.
 * Used by لوحة اليوم card and optional Telegram DM (no spam when empty).
 */
import { listPendingApprovals } from '@/lib/agents/resolve-approval'
import { countUnread, listMessages } from '@/lib/email/imap-store'
import {
  findRoomConflicts,
  listRoomCalendarEvents,
  type ConflictInfo,
  type RoomCalendarEvent,
} from '@/lib/rooms/room-calendar'
import { listRoomTasks } from '@/lib/rooms/room-tasks'
import { listTelegramFeed } from '@/lib/rooms/telegram-feed'
import { isHitlDisabled } from '@/lib/security/posture'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'

const TZ = 'Asia/Riyadh'

function riyadhDayBounds(offsetDays = 0) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const base = new Date(Date.now() + offsetDays * 86400_000)
  const ymd = fmt.format(base)
  const start = new Date(`${ymd}T00:00:00+03:00`)
  const end = new Date(`${ymd}T23:59:59.999+03:00`)
  return { ymd, start, end }
}

function fmtWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: TZ,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function collectTodayConflicts(events: RoomCalendarEvent[]): ConflictInfo[] {
  const out: ConflictInfo[] = []
  const seen = new Set<string>()
  for (const e of events) {
    const hits = findRoomConflicts(events, {
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      excludeId: e.id,
    })
    for (const h of hits) {
      const key = [e.id, h.eventId].sort().join(':')
      if (seen.has(key)) continue
      seen.add(key)
      out.push(h)
    }
  }
  return out.slice(0, 8)
}

export type OwnerMorningBrief = {
  ymd: string
  hasContent: boolean
  orgMail: {
    unread: number
    recent: Array<{ id: string; subject: string; from: string; whenAr: string }>
  }
  telegram: Array<{ id: string; textAr: string; senderAr: string; atAr: string }>
  conflicts: Array<{ titleAr: string; whenAr: string; overlapMinutes: number }>
  overdueTasks: Array<{ id: string; titleAr: string; assigneeAr?: string | null }>
  todayEvents: Array<{ id: string; titleAr: string; whenAr: string }>
  /** Appointments ~1h away — matches Telegram reminder window (no spam). */
  soonReminders: Array<{ id: string; titleAr: string; whenAr: string; mins: number }>
  pendingApprovals: number
  textAr: string
}

/** Build Arabic owner brief for a room (defaults to primary team scope). */
export async function buildOwnerMorningBrief(
  scopeId = PRIMARY_TEAM_SCOPE_ID
): Promise<OwnerMorningBrief> {
  const today = riyadhDayBounds(0)
  const now = Date.now()

  const [unread, recentMail, feed, events, tasks, pending] = await Promise.all([
    countUnread().catch(() => 0),
    listMessages({ unreadOnly: true, limit: 6 }).catch(() => []),
    listTelegramFeed(scopeId, 12).catch(() => ({ ok: false, items: [] as never[] })),
    listRoomCalendarEvents({
      scopeId,
      from: today.start.toISOString(),
      to: today.end.toISOString(),
    }).catch(() => [] as RoomCalendarEvent[]),
    listRoomTasks(scopeId).catch(() => []),
    isHitlDisabled()
      ? Promise.resolve([])
      : listPendingApprovals().catch(() => []),
  ])

  const conflicts = collectTodayConflicts(events)
  const open = tasks.filter(
    (t) => t.status === 'open' || t.status === 'in_progress'
  )
  const overdueTasks = open
    .filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now)
    .slice(0, 8)
  const scopedPending = pending.filter(
    (p) => !p.scopeId || p.scopeId === scopeId
  )

  const recent = (recentMail || []).slice(0, 5).map((m) => ({
    id: String(m.id),
    subject: String(m.subject || '(بدون موضوع)'),
    from: String(m.from_addr || ''),
    whenAr: m.date_at
      ? fmtWhen(
          m.date_at instanceof Date
            ? m.date_at.toISOString()
            : String(m.date_at)
        )
      : '',
  }))

  const telegram = (feed.items || [])
    .filter((i) => i.source === 'telegram' || i.source === 'bot')
    .slice(0, 5)
    .map((i) => ({
      id: i.id,
      textAr: i.textAr.slice(0, 160),
      senderAr: i.senderAr,
      atAr: i.atAr,
    }))

  const todayEvents = events.slice(0, 8).map((e) => ({
    id: e.id,
    titleAr: e.titleAr,
    whenAr: fmtWhen(e.startsAt),
  }))

  const { listSoonAppointmentRemindersAr } = await import(
    '@/lib/rooms/appointment-reminders'
  )
  const soonReminders = await listSoonAppointmentRemindersAr({
    scopeId,
    now: new Date(now),
  }).catch(() => [])

  const hasContent =
    unread > 0 ||
    recent.length > 0 ||
    telegram.length > 0 ||
    conflicts.length > 0 ||
    overdueTasks.length > 0 ||
    todayEvents.length > 0 ||
    soonReminders.length > 0 ||
    scopedPending.length > 0

  const lines = [
    '☀️ إحاطة الصباح — Arabic Buzz',
    `اليوم: ${today.ymd} · توقيت السعودية`,
    '',
  ]

  if (unread > 0 || recent.length) {
    lines.push(`── بريد الجمعية · ${unread} غير مقروء ──`)
    for (const m of recent) {
      lines.push(`• ${m.subject}${m.from ? ` · ${m.from}` : ''}`)
    }
    lines.push('')
  }

  if (conflicts.length) {
    lines.push('── تعارضات تقويم اليوم ──')
    for (const c of conflicts) {
      lines.push(
        `• ${c.titleAr} · تداخل ${c.overlapMinutes} د · ${fmtWhen(c.startsAt)}`
      )
    }
    lines.push('')
  }

  if (overdueTasks.length) {
    lines.push('── مهام متأخرة ──')
    for (const t of overdueTasks) {
      lines.push(
        `• ${t.titleAr}${t.assigneeAr ? ` · ${t.assigneeAr}` : ''}`
      )
    }
    lines.push('')
  }

  if (todayEvents.length) {
    lines.push('── مواعيد اليوم ──')
    for (const e of todayEvents) {
      lines.push(`• ${e.titleAr} · ${e.whenAr}`)
    }
    lines.push('')
  }

  if (soonReminders.length) {
    lines.push('── تذكير قريب (≈ ساعة) ──')
    for (const e of soonReminders) {
      lines.push(`• ${e.titleAr} · بعد ≈${e.mins} د · ${e.whenAr}`)
    }
    lines.push('')
  }

  if (telegram.length) {
    lines.push('── أبرز تيليجرام ──')
    for (const t of telegram) {
      lines.push(`• ${t.senderAr}: ${t.textAr}`)
    }
    lines.push('')
  }

  if (scopedPending.length) {
    lines.push(`── موافقات معلّقة: ${scopedPending.length} ──`)
    lines.push('')
  }

  return {
    ymd: today.ymd,
    hasContent,
    orgMail: { unread, recent },
    telegram,
    conflicts: conflicts.map((c) => ({
      titleAr: c.titleAr,
      whenAr: fmtWhen(c.startsAt),
      overlapMinutes: c.overlapMinutes,
    })),
    overdueTasks: overdueTasks.map((t) => ({
      id: t.id,
      titleAr: t.titleAr,
      assigneeAr: t.assigneeAr,
    })),
    todayEvents,
    soonReminders,
    pendingApprovals: scopedPending.length,
    textAr: lines.join('\n').slice(0, 3500),
  }
}
