/**
 * Daily Arabic morning digest per room (Telegram) — skip when nothing to report.
 */
import { listPendingApprovals } from '@/lib/agents/resolve-approval'
import { appBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/emit'
import { listRoomCalendarEvents } from '@/lib/rooms/room-calendar'
import { listRoomTasks } from '@/lib/rooms/room-tasks'
import { isHitlDisabled } from '@/lib/security/posture'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { hasTelegramOwnerTarget } from '@/lib/channels/bindings'

const TZ = 'Asia/Riyadh'

function riyadhYmd(offsetDays: number): { ymd: string; start: Date; end: Date } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const now = new Date()
  const base = new Date(now.getTime() + offsetDays * 86400_000)
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

/** True during morning window Asia/Riyadh (06:00–10:59) so hourly cron sends once. */
export function isMorningDigestWindow(now = new Date()): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ,
        hour: 'numeric',
        hour12: false,
      }).format(now)
    )
    return hour >= 6 && hour <= 10
  } catch {
    return false
  }
}

async function listScopedRoomsWithTelegram(): Promise<string[]> {
  const scopes = new Set<string>([
    process.env.TELEGRAM_DEFAULT_SCOPE_ID || 'shared-demo',
    'shared-demo',
    'shared-ops',
  ])
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data } = await sb
      .from('channel_bindings')
      .select('scope_id')
      .eq('channel', 'telegram')
      .limit(40)
    for (const row of data || []) {
      if (row.scope_id) scopes.add(String(row.scope_id))
    }
    try {
      const { data: committees } = await sb
        .from('room_committee_channels')
        .select('scope_id')
        .limit(40)
      for (const row of committees || []) {
        if (row.scope_id) scopes.add(String(row.scope_id))
      }
    } catch {
      /* table may not exist */
    }
  }
  return [...scopes].filter((s) => !s.startsWith('personal'))
}

export type MorningDigestResult = {
  scopeId: string
  sent: boolean
  skipped?: boolean
  reason?: string
}

export async function buildMorningDigestAr(scopeId: string): Promise<{
  textAr: string
  hasContent: boolean
}> {
  const today = riyadhYmd(0)
  const tomorrow = riyadhYmd(1)
  const now = Date.now()

  const [tasks, events, pending] = await Promise.all([
    listRoomTasks(scopeId).catch(() => []),
    listRoomCalendarEvents({
      scopeId,
      from: today.start.toISOString(),
      to: tomorrow.end.toISOString(),
    }).catch(() => []),
    isHitlDisabled()
      ? Promise.resolve([])
      : listPendingApprovals().catch(() => []),
  ])

  const open = tasks.filter(
    (t) => t.status === 'open' || t.status === 'in_progress'
  )
  const overdue = open.filter(
    (t) => t.dueAt && new Date(t.dueAt).getTime() < now
  )
  const tomorrowEvents = events.filter((e) => {
    const t = new Date(e.startsAt).getTime()
    return t >= tomorrow.start.getTime() && t <= tomorrow.end.getTime()
  })
  const scopedPending = pending.filter(
    (p) => !p.scopeId || p.scopeId === scopeId
  )

  const hasContent =
    overdue.length > 0 ||
    open.length > 0 ||
    tomorrowEvents.length > 0 ||
    scopedPending.length > 0

  if (!hasContent) {
    return { textAr: '', hasContent: false }
  }

  const base = appBaseUrl()
  const lines = [
    '☀️ ملخص صباحي — Arabic Buzz',
    `الغرفة: ${scopeId}`,
    '',
  ]

  if (overdue.length) {
    lines.push('── مهام متأخرة ──')
    for (const t of overdue.slice(0, 8)) {
      lines.push(
        `• ${t.titleAr}${t.assigneeAr ? ` · ${t.assigneeAr}` : ''}`
      )
    }
    lines.push('')
  }

  const otherOpen = open.filter((t) => !overdue.includes(t))
  if (otherOpen.length) {
    lines.push('── مهام مفتوحة ──')
    for (const t of otherOpen.slice(0, 8)) {
      lines.push(
        `• ${t.titleAr}${t.assigneeAr ? ` · ${t.assigneeAr}` : ''}`
      )
    }
    lines.push('')
  }

  if (scopedPending.length) {
    lines.push('── موافقات معلّقة ──')
    for (const p of scopedPending.slice(0, 6)) {
      lines.push(`• ${p.actionName}`)
    }
    lines.push('')
  }

  if (tomorrowEvents.length) {
    lines.push('── مواعيد غداً ──')
    for (const e of tomorrowEvents.slice(0, 8)) {
      lines.push(`• ${e.titleAr} · ${fmtWhen(e.startsAt)}`)
    }
    lines.push('')
  }

  lines.push(`👉 الغرفة: ${base}/`)
  if (scopedPending.length) {
    lines.push(`الموافقات: ${base}/?section=approvals`)
  }

  return { textAr: lines.join('\n').slice(0, 3500), hasContent: true }
}

export async function sendMorningRoomDigests(opts?: {
  force?: boolean
  now?: Date
}): Promise<{ results: MorningDigestResult[]; windowOk: boolean }> {
  const now = opts?.now || new Date()
  const windowOk = opts?.force || isMorningDigestWindow(now)
  if (!windowOk) {
    return {
      results: [],
      windowOk: false,
    }
  }

  const hasTg = await hasTelegramOwnerTarget().catch(() => false)
  if (!hasTg && !process.env.TELEGRAM_BOT_TOKEN) {
    return {
      results: [{ scopeId: '*', sent: false, skipped: true, reason: 'no_telegram' }],
      windowOk: true,
    }
  }

  const scopes = await listScopedRoomsWithTelegram()
  const results: MorningDigestResult[] = []

  for (const scopeId of scopes) {
    try {
      const { textAr, hasContent } = await buildMorningDigestAr(scopeId)
      if (!hasContent) {
        results.push({
          scopeId,
          sent: false,
          skipped: true,
          reason: 'empty',
        })
        continue
      }
      const r = await emitNotification({
        channel: 'telegram',
        textAr,
        meta: { scopeId },
      })
      results.push({
        scopeId,
        sent: r.ok,
        skipped: !r.ok,
        reason: r.ok ? undefined : 'send_failed',
      })
    } catch (e) {
      results.push({
        scopeId,
        sent: false,
        skipped: true,
        reason: e instanceof Error ? e.message : 'error',
      })
    }
  }

  return { results, windowOk: true }
}
