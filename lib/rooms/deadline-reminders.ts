/**
 * Push association system-deadline reminders to Telegram.
 * Fires on meta.reminderDays (default 30/14/7/1) and on due day (0).
 * Dedupes via event meta.lastTelegramReminderDaysLeft.
 */
import {
  upcomingSystemDeadlines,
  SYSTEM_DEADLINE_LABELS_AR,
  type SystemDeadlineKind,
} from '@/lib/rooms/system-deadlines'
import { updateRoomCalendarEvent } from '@/lib/rooms/room-calendar'
import { emitNotification } from '@/lib/notifications/emit'
import { DEMO_SCOPES, isSharedScope } from '@/lib/scopes/manager'
import { appBaseUrl } from '@/lib/app-url'

const DEFAULT_REMINDER_DAYS = [30, 14, 7, 1, 0]

function scopesToScan(): string[] {
  const fromEnv = (process.env.DEADLINE_REMINDER_SCOPES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (fromEnv.length) return fromEnv
  return DEMO_SCOPES.filter((s) => isSharedScope(s)).map((s) => s.id)
}

function reminderDaysFor(meta: Record<string, unknown> | undefined): number[] {
  const raw = meta?.reminderDays
  if (Array.isArray(raw) && raw.every((n) => typeof n === 'number')) {
    return [...new Set([...raw, 0])]
  }
  return DEFAULT_REMINDER_DAYS
}

export async function runDeadlineTelegramReminders(): Promise<{
  sent: number
  skipped: number
  details: string[]
}> {
  const details: string[] = []
  let sent = 0
  let skipped = 0
  const base = appBaseUrl()

  for (const scopeId of scopesToScan()) {
    const upcoming = await upcomingSystemDeadlines(scopeId, 35).catch(() => [])
    for (const d of upcoming) {
      const days = reminderDaysFor(d.meta)
      if (!days.includes(d.daysLeft)) {
        skipped += 1
        continue
      }
      const last = d.meta?.lastTelegramReminderDaysLeft
      if (typeof last === 'number' && last === d.daysLeft) {
        skipped += 1
        continue
      }

      // Claim BEFORE send — concurrent cron ticks must not re-fire the same day-left.
      const { claimDigestDayKey } = await import('@/lib/digest/day-claim')
      const claimKey = `deadline:${d.id}:${d.daysLeft}`
      const claimed = await claimDigestDayKey(claimKey)
      if (!claimed) {
        skipped += 1
        details.push(`dup:${scopeId}:${d.kind}:${d.daysLeft}`)
        continue
      }

      const when =
        d.daysLeft < 0
          ? `متأخر ${Math.abs(d.daysLeft)} يوماً`
          : d.daysLeft === 0
            ? 'اليوم'
            : `بعد ${d.daysLeft} يوماً`
      const kind = d.kind as SystemDeadlineKind
      const label =
        d.labelAr || SYSTEM_DEADLINE_LABELS_AR[kind] || d.titleAr
      const textAr = [
        `⏰ تذكير موعد نظامي`,
        `«${label}» — ${when}`,
        `الغرفة: ${scopeId}`,
        `التقويم: ${base}/?section=calendar`,
      ].join('\n')

      const res = await emitNotification({
        channel: 'telegram',
        textAr,
        meta: { scopeId, deadlineKind: kind, daysLeft: d.daysLeft },
      })

      if (res.ok) {
        sent += 1
        details.push(`${scopeId}:${kind}:${d.daysLeft}`)
        await updateRoomCalendarEvent(d.id, scopeId, {
          meta: {
            ...d.meta,
            lastTelegramReminderDaysLeft: d.daysLeft,
            lastTelegramReminderAt: new Date().toISOString(),
          },
        }).catch(() => null)
      } else {
        skipped += 1
        details.push(`fail:${scopeId}:${kind}`)
      }
    }
  }

  return { sent, skipped, details }
}
