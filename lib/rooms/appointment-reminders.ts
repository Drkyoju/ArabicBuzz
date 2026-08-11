/**
 * Room calendar appointment → Telegram reminder near start.
 * Clear MSA copy; single send per event (claim + meta) — no spam.
 *
 * Paths:
 * - Narrow group: TELEGRAM_GROUP_APPOINTMENT_REMINDERS=1 (silence may stay ON;
 *   digests stay off — does NOT need TELEGRAM_GROUP_PUSH).
 * - Legacy group: silence OFF + TELEGRAM_GROUP_PUSH + TELEGRAM_APPOINTMENT_REMINDERS.
 * - Safe fallback: owner DM when TELEGRAM_OWNER_CHAT_ID is a private chat.
 *
 * Never re-enables morning digests or weekly group spam.
 * Cron: /api/crons/appointment-reminders (dedicated) or full /api/crons/runner.
 */
import { listRoomCalendarEvents, updateRoomCalendarEvent } from '@/lib/rooms/room-calendar'
import { emitNotification } from '@/lib/notifications/emit'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { appBaseUrl } from '@/lib/app-url'
import {
  isTelegramGroupAppointmentRemindersAllowed,
  isTelegramGroupPushAllowed,
  isTelegramOwnerReminderDmAllowed,
  resolveTelegramOwnerDmChatId,
  telegramGroupPushDisabledReason,
} from '@/lib/telegram/group-push-policy'

const TZ = 'Asia/Riyadh'
/** Catch window half-width for ~15-min cron (±7.5 min around fire time). */
const CATCH_HALF_MS = 7.5 * 60_000
/** Default reminder offset when event has no meta.reminderMinutes. */
export const DEFAULT_REMINDER_MINUTES = 60

const ALLOWED_REMINDER_MINUTES = new Set([15, 30, 60, 120, 1440])

export function normalizeReminderMinutes(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_REMINDER_MINUTES
  const rounded = Math.round(n)
  if (ALLOWED_REMINDER_MINUTES.has(rounded)) return rounded
  // Closest allowed preset
  let best = DEFAULT_REMINDER_MINUTES
  let bestDiff = Infinity
  for (const m of ALLOWED_REMINDER_MINUTES) {
    const d = Math.abs(m - rounded)
    if (d < bestDiff) {
      bestDiff = d
      best = m
    }
  }
  return best
}

export function reminderMinutesFromMeta(
  meta: Record<string, unknown> | null | undefined
): number {
  if (!meta || typeof meta !== 'object') return DEFAULT_REMINDER_MINUTES
  return normalizeReminderMinutes(meta.reminderMinutes)
}

function fmtWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: TZ,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

async function scopesWithTelegram(): Promise<string[]> {
  const scopes = new Set<string>([
    process.env.TELEGRAM_DEFAULT_SCOPE_ID || 'shared-demo',
    'shared-demo',
  ])
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data } = await sb
      .from('channel_bindings')
      .select('scope_id')
      .eq('channel', 'telegram')
      .limit(60)
    for (const row of data || []) {
      if (row.scope_id) scopes.add(String(row.scope_id))
    }
  }
  return [...scopes].filter((s) => !s.startsWith('personal'))
}

/** Build reminder body (exported for unit tests). Short for group; clear once-only. */
export function buildAppointmentReminderTextAr(opts: {
  titleAr: string
  startsAt: string
  locationAr?: string | null
  attendees?: string[]
  mins: number
  calendarUrl?: string
  /** When true: owner DM path (group silenced). */
  ownerDmOnly?: boolean
}): string {
  const mins = Math.max(1, opts.mins)
  const when = fmtWhen(opts.startsAt)
  const guests =
    Array.isArray(opts.attendees) && opts.attendees.length > 0
      ? `المدعوون: ${opts.attendees.slice(0, 8).join(', ')}`
      : ''
  const header = opts.ownerDmOnly
    ? 'تذكير موعد (خاص للمدير)'
    : 'تذكير موعد'
  return [
    header,
    `«${opts.titleAr}»`,
    `الوقت: ${when}`,
    opts.locationAr ? `المكان: ${opts.locationAr}` : '',
    guests,
    mins >= 1440
      ? `يتبقى حوالي ${Math.round(mins / 1440)} يوم`
      : mins >= 60 && mins % 60 === 0
        ? `يتبقى حوالي ${mins / 60} ساعة`
        : `يتبقى حوالي ${mins} دقيقة`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Upcoming appointments in any reminder catch window — for لوحة اليوم (read-only). */
export async function listSoonAppointmentRemindersAr(opts?: {
  scopeId?: string
  now?: Date
}): Promise<
  Array<{ id: string; titleAr: string; whenAr: string; mins: number }>
> {
  const now = opts?.now || new Date()
  const t0 = now.getTime()
  // Look ahead up to 25h so 1-day reminders appear in preview.
  const from = new Date(t0).toISOString()
  const to = new Date(t0 + 26 * 60 * 60_000).toISOString()
  const scopeId =
    opts?.scopeId || process.env.TELEGRAM_DEFAULT_SCOPE_ID || 'shared-demo'
  const events = await listRoomCalendarEvents({
    scopeId,
    from,
    to,
    hideTestTitles: true,
  }).catch(() => [])
  return events
    .filter((ev) => ev.status !== 'cancelled')
    .filter((ev) => {
      const offsetMs = reminderMinutesFromMeta(ev.meta) * 60_000
      const fireAt = new Date(ev.startsAt).getTime() - offsetMs
      const delta = fireAt - t0
      return Math.abs(delta) <= CATCH_HALF_MS || (delta >= 0 && delta <= CATCH_HALF_MS * 2)
    })
    .map((ev) => {
      const delta = new Date(ev.startsAt).getTime() - t0
      return {
        id: ev.id,
        titleAr: ev.titleAr,
        whenAr: fmtWhen(ev.startsAt),
        mins: Math.max(1, Math.round(delta / 60_000)),
      }
    })
}

function eventDueForReminder(
  ev: { startsAt: string; meta: Record<string, unknown> },
  t0: number
): { due: boolean; mins: number; offsetMin: number } {
  const offsetMin = reminderMinutesFromMeta(ev.meta)
  const starts = new Date(ev.startsAt).getTime()
  if (!Number.isFinite(starts)) return { due: false, mins: 0, offsetMin }
  const fireAt = starts - offsetMin * 60_000
  const skew = t0 - fireAt
  // Fire when now is within ±CATCH_HALF of the intended fire moment.
  const due = skew >= -CATCH_HALF_MS && skew <= CATCH_HALF_MS
  const mins = Math.max(1, Math.round((starts - t0) / 60_000))
  return { due, mins, offsetMin }
}

export async function runAppointmentTelegramReminders(opts?: {
  now?: Date
}): Promise<{ sent: number; skipped: number; details: string[] }> {
  const groupOk = isTelegramGroupPushAllowed('appointment_reminder')
  const ownerOk = isTelegramOwnerReminderDmAllowed('appointment_reminder')
  const ownerDm = resolveTelegramOwnerDmChatId()
  const narrowGroup = isTelegramGroupAppointmentRemindersAllowed()

  if (!groupOk && !ownerOk) {
    return {
      sent: 0,
      skipped: 0,
      details: [telegramGroupPushDisabledReason('appointment_reminder')],
    }
  }

  const ownerDmOnly = !groupOk && ownerOk
  const now = opts?.now || new Date()
  const t0 = now.getTime()
  const details: string[] = []
  let sent = 0
  let skipped = 0
  const base = appBaseUrl()

  // Fetch a wide horizon so 1-day offsets are visible to the catcher.
  const from = new Date(t0 - CATCH_HALF_MS).toISOString()
  const to = new Date(t0 + 26 * 60 * 60_000).toISOString()

  for (const scopeId of await scopesWithTelegram()) {
    const events = await listRoomCalendarEvents({
      scopeId,
      from,
      to,
      hideTestTitles: true,
    }).catch(() => [])

    for (const ev of events) {
      if (ev.status === 'cancelled') {
        skipped += 1
        continue
      }
      if (ev.meta?.hourReminderSentAt || ev.meta?.reminderSentAt) {
        skipped += 1
        continue
      }
      const { due, mins, offsetMin } = eventDueForReminder(ev, t0)
      if (!due) {
        skipped += 1
        continue
      }

      // Claim BEFORE send so concurrent cron runners cannot double-fire.
      const { claimDigestDayKey } = await import('@/lib/digest/day-claim')
      const claimKey = `appt-rem:${ev.id}:${offsetMin}`
      const claimed = await claimDigestDayKey(claimKey)
      if (!claimed) {
        skipped += 1
        details.push(`dup:${scopeId}:${ev.id}`)
        continue
      }

      const textAr = buildAppointmentReminderTextAr({
        titleAr: ev.titleAr,
        startsAt: ev.startsAt,
        locationAr: ev.locationAr,
        attendees: ev.attendees,
        mins,
        calendarUrl: `${base}/?section=calendar`,
        ownerDmOnly,
      })

      const res = await emitNotification({
        channel: 'telegram',
        textAr,
        to: ownerDmOnly && ownerDm ? ownerDm : undefined,
        meta: {
          scopeId,
          kind: 'appointment_hour_reminder',
          eventId: ev.id,
          reminderMinutes: offsetMin,
          ...(ownerDmOnly ? { ownerDmOnly: true } : {}),
          ...(narrowGroup && !ownerDmOnly
            ? { groupAppointmentReminders: true }
            : {}),
        },
      })

      if (res.ok) {
        sent += 1
        details.push(
          ownerDmOnly
            ? `owner-dm:${scopeId}:${ev.id}`
            : `group:${scopeId}:${ev.id}`
        )
        await updateRoomCalendarEvent(ev.id, scopeId, {
          meta: {
            ...ev.meta,
            hourReminderSentAt: now.toISOString(),
            reminderSentAt: now.toISOString(),
            reminderMinutes: offsetMin,
          },
        }).catch(() => null)
      } else {
        skipped += 1
        details.push(`fail:${scopeId}:${ev.id}`)
      }
    }
  }

  return { sent, skipped, details }
}
