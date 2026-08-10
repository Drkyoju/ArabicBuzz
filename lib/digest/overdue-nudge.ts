/**
 * Quiet overdue-task nudge — only when overdue exists; once per Riyadh day per chat.
 */
import { appBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/emit'
import { listRoomTasks } from '@/lib/rooms/room-tasks'
import {
  hasTelegramOwnerTarget,
  listUniqueTelegramDigestTargets,
} from '@/lib/channels/bindings'
import { isMorningDigestWindow } from '@/lib/digest/morning-room'
import { claimDigestDayKey } from '@/lib/digest/day-claim'
import {
  isTelegramGroupPushAllowed,
  telegramGroupPushDisabledReason,
} from '@/lib/telegram/group-push-policy'

const TZ = 'Asia/Riyadh'

function riyadhYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export type OverdueNudgeResult = {
  scopeId: string
  chatId?: string
  sent: boolean
  skipped?: boolean
  reason?: string
  overdueCount?: number
}

export async function buildOverdueNudgeAr(scopeId: string): Promise<{
  textAr: string
  overdueCount: number
}> {
  const now = Date.now()
  const tasks = await listRoomTasks(scopeId).catch(() => [])
  const overdue = tasks
    .filter((t) => t.status === 'open' || t.status === 'in_progress')
    .filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now)

  if (!overdue.length) {
    return { textAr: '', overdueCount: 0 }
  }

  const lines = [
    '⏰ تذكير المتأخر — Arabic Buzz',
    `الغرفة: ${scopeId}`,
    `مهام متأخرة: ${overdue.length}`,
    '',
  ]
  for (const t of overdue.slice(0, 10)) {
    lines.push(`• ${t.titleAr}${t.assigneeAr ? ` · ${t.assigneeAr}` : ''}`)
  }
  lines.push('', `👉 المهام: ${appBaseUrl()}/?section=calendar`)
  return { textAr: lines.join('\n').slice(0, 3000), overdueCount: overdue.length }
}

/**
 * Send overdue-only Telegram nudge. Skips empty rooms and duplicates same day.
 */
export async function sendOverdueNudges(opts?: {
  force?: boolean
  now?: Date
}): Promise<{ results: OverdueNudgeResult[]; windowOk: boolean }> {
  if (!isTelegramGroupPushAllowed('overdue_nudge')) {
    return {
      results: [
        {
          scopeId: '*',
          sent: false,
          skipped: true,
          reason: telegramGroupPushDisabledReason('overdue_nudge'),
        },
      ],
      windowOk: false,
    }
  }

  const now = opts?.now || new Date()
  const windowOk = opts?.force || isMorningDigestWindow(now)
  if (!windowOk) {
    return { results: [], windowOk: false }
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

  const ymd = riyadhYmd(now)
  const results: OverdueNudgeResult[] = []

  for (const { scopeId, chatId } of await listUniqueTelegramDigestTargets()) {
    const claimKey = `overdue:${ymd}:${chatId}`
    try {
      const { textAr, overdueCount } = await buildOverdueNudgeAr(scopeId)
      if (!overdueCount) {
        results.push({
          scopeId,
          chatId,
          sent: false,
          skipped: true,
          reason: 'empty',
          overdueCount: 0,
        })
        continue
      }

      if (!opts?.force) {
        const claimed = await claimDigestDayKey(claimKey)
        if (!claimed) {
          results.push({
            scopeId,
            chatId,
            sent: false,
            skipped: true,
            reason: 'already_sent_today',
            overdueCount,
          })
          continue
        }
      }

      const r = await emitNotification({
        channel: 'telegram',
        textAr,
        to: chatId,
        meta: { scopeId, kind: 'overdue_nudge', dayKey: claimKey },
      })
      results.push({
        scopeId,
        chatId,
        sent: r.ok,
        skipped: !r.ok,
        reason: r.ok ? undefined : 'send_failed',
        overdueCount,
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
