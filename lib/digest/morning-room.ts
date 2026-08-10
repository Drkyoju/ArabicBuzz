/**
 * Daily Arabic morning digest per Telegram chat — once per Riyadh day.
 * Skips when nothing to report. Dedupes by chat_id so multi-scope fan-out
 * cannot spam the same group.
 */
import { listPendingApprovals } from '@/lib/agents/resolve-approval'
import { appBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/emit'
import { listRoomCalendarEvents } from '@/lib/rooms/room-calendar'
import { listRoomTasks } from '@/lib/rooms/room-tasks'
import { isHitlDisabled } from '@/lib/security/posture'
import {
  hasTelegramOwnerTarget,
  listUniqueTelegramDigestTargets,
} from '@/lib/channels/bindings'
import { claimDigestDayKey } from '@/lib/digest/day-claim'
import {
  isTelegramGroupPushAllowed,
  telegramGroupPushDisabledReason,
} from '@/lib/telegram/group-push-policy'

const TZ = 'Asia/Riyadh'

function riyadhYmd(offsetDays: number, now = new Date()): {
  ymd: string
  start: Date
  end: Date
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
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

/** True during morning window Asia/Riyadh (06:00–10:59). */
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

export type MorningDigestResult = {
  scopeId: string
  chatId?: string
  sent: boolean
  skipped?: boolean
  reason?: string
}

export async function buildMorningDigestAr(
  scopeId: string,
  now = new Date()
): Promise<{
  textAr: string
  hasContent: boolean
}> {
  const today = riyadhYmd(0, now)
  const tomorrow = riyadhYmd(1, now)
  const nowMs = now.getTime()

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
    (t) => t.dueAt && new Date(t.dueAt).getTime() < nowMs
  )
  const todayEvents = events.filter((e) => {
    const t = new Date(e.startsAt).getTime()
    return t >= today.start.getTime() && t <= today.end.getTime()
  })
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
    todayEvents.length > 0 ||
    tomorrowEvents.length > 0 ||
    scopedPending.length > 0

  if (!hasContent) {
    return { textAr: '', hasContent: false }
  }

  const base = appBaseUrl()
  const lines = [
    '☀️ ملخص صباحي — Arabic Buzz',
    `الغرفة: ${scopeId} · توقيت السعودية`,
    `اليوم: ${today.ymd}`,
    '',
  ]

  if (todayEvents.length) {
    lines.push('── مواعيد اليوم ──')
    for (const e of todayEvents.slice(0, 10)) {
      lines.push(`• ${e.titleAr} · ${fmtWhen(e.startsAt)}`)
    }
    lines.push('')
  }

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
  if (!isTelegramGroupPushAllowed('morning_digest')) {
    return {
      results: [
        {
          scopeId: '*',
          sent: false,
          skipped: true,
          reason: telegramGroupPushDisabledReason('morning_digest'),
        },
      ],
      windowOk: false,
    }
  }

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
      results: [
        { scopeId: '*', sent: false, skipped: true, reason: 'no_telegram' },
      ],
      windowOk: true,
    }
  }

  const targets = await listUniqueTelegramDigestTargets()
  const ymd = riyadhYmd(0, now).ymd
  const results: MorningDigestResult[] = []

  for (const { scopeId, chatId } of targets) {
    const claimKey = `morning:${ymd}:${chatId}`
    try {
      const { textAr, hasContent } = await buildMorningDigestAr(scopeId, now)
      if (!hasContent) {
        results.push({
          scopeId,
          chatId,
          sent: false,
          skipped: true,
          reason: 'empty',
        })
        continue
      }

      // Claim after content check so empty mornings do not burn the day lock.
      if (!opts?.force) {
        const claimed = await claimDigestDayKey(claimKey)
        if (!claimed) {
          results.push({
            scopeId,
            chatId,
            sent: false,
            skipped: true,
            reason: 'already_sent_today',
          })
          continue
        }
      }

      const r = await emitNotification({
        channel: 'telegram',
        textAr,
        to: chatId,
        meta: { scopeId, kind: 'morning_digest', dayKey: claimKey },
      })
      results.push({
        scopeId,
        chatId,
        sent: r.ok,
        skipped: !r.ok,
        reason: r.ok ? undefined : 'send_failed',
      })
    } catch (e) {
      results.push({
        scopeId,
        chatId,
        sent: false,
        skipped: true,
        reason: e instanceof Error ? e.message : 'error',
      })
    }
  }

  return { results, windowOk: true }
}
