/**
 * Push association system-deadline reminders to Telegram.
 * Fires on meta.reminderDays (default 30/14/7/1) and on due day (0).
 * Dedupes via event meta.lastTelegramReminderDaysLeft.
 *
 * Group push OFF by default. Safe fallback: owner DM only
 * (TELEGRAM_OWNER_CHAT_ID private) — never association-group spam.
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
import {
  isTelegramGroupPushAllowed,
  isTelegramOwnerReminderDmAllowed,
  resolveTelegramOwnerDmChatId,
  telegramGroupPushDisabledReason,
} from '@/lib/telegram/group-push-policy'

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
  const groupOk = isTelegramGroupPushAllowed('deadline_reminder')
  const ownerOk = isTelegramOwnerReminderDmAllowed('deadline_reminder')
  const ownerDm = resolveTelegramOwnerDmChatId()

  if (!groupOk && !ownerOk) {
    return {
      sent: 0,
      skipped: 0,
      details: [telegramGroupPushDisabledReason('deadline_reminder')],
    }
  }

  const ownerDmOnly = !groupOk && ownerOk
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
        ownerDmOnly
          ? '⏰ تذكير موعد نظامي (خاص للمدير)'
          : '⏰ تذكير موعد نظامي',
        `مواعيد الجمعية/الفريق — «${label}» — ${when}`,
        `الغرفة: ${scopeId}`,
        'ليس تقويمك الشخصي على Google.',
        `التقويم: ${base}/?section=calendar`,
      ].join('\n')

      const res = await emitNotification({
        channel: 'telegram',
        textAr,
        to: ownerDmOnly && ownerDm ? ownerDm : undefined,
        meta: {
          scopeId,
          deadlineKind: kind,
          daysLeft: d.daysLeft,
          ...(ownerDmOnly ? { ownerDmOnly: true } : {}),
        },
      })

      if (res.ok) {
        sent += 1
        details.push(
          ownerDmOnly
            ? `owner-dm:${scopeId}:${kind}:${d.daysLeft}`
            : `${scopeId}:${kind}:${d.daysLeft}`
        )
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
