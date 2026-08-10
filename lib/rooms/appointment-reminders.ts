/**
 * ~1 hour before room calendar appointments → Telegram (linked group).
 * Also surfaces a short dashboard-friendly detail list (no extra spam).
 * Runs inside /api/crons/runner (GitHub Actions every ~15 min).
 */
import { listRoomCalendarEvents, updateRoomCalendarEvent } from '@/lib/rooms/room-calendar'
import { emitNotification } from '@/lib/notifications/emit'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { appBaseUrl } from '@/lib/app-url'

const TZ = 'Asia/Riyadh'
/** Catch window so a 15-min cron fires once per appointment. */
const WINDOW_MIN_MS = 50 * 60_000
const WINDOW_MAX_MS = 75 * 60_000

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

/** Upcoming appointments in the reminder window — for لوحة اليوم (read-only). */
export async function listSoonAppointmentRemindersAr(opts?: {
  scopeId?: string
  now?: Date
}): Promise<
  Array<{ id: string; titleAr: string; whenAr: string; mins: number }>
> {
  const now = opts?.now || new Date()
  const t0 = now.getTime()
  const from = new Date(t0 + WINDOW_MIN_MS).toISOString()
  const to = new Date(t0 + WINDOW_MAX_MS).toISOString()
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

export async function runAppointmentTelegramReminders(opts?: {
  now?: Date
}): Promise<{ sent: number; skipped: number; details: string[] }> {
  const now = opts?.now || new Date()
  const t0 = now.getTime()
  const from = new Date(t0 + WINDOW_MIN_MS).toISOString()
  const to = new Date(t0 + WINDOW_MAX_MS).toISOString()
  const details: string[] = []
  let sent = 0
  let skipped = 0
  const base = appBaseUrl()

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
      if (ev.meta?.hourReminderSentAt) {
        skipped += 1
        continue
      }
      const starts = new Date(ev.startsAt).getTime()
      const delta = starts - t0
      if (delta < WINDOW_MIN_MS || delta > WINDOW_MAX_MS) {
        skipped += 1
        continue
      }

      const mins = Math.max(1, Math.round(delta / 60_000))
      const textAr = [
        '⏰ تذكير موعد — بعد حوالي ساعة',
        `«${ev.titleAr}»`,
        `الوقت: ${fmtWhen(ev.startsAt)} (توقيت السعودية)`,
        ev.locationAr ? `المكان: ${ev.locationAr}` : '',
        `≈ ${mins} دقيقة`,
        `التقويم: ${base}/?section=calendar`,
      ]
        .filter(Boolean)
        .join('\n')

      const res = await emitNotification({
        channel: 'telegram',
        textAr,
        meta: {
          scopeId,
          kind: 'appointment_hour_reminder',
          eventId: ev.id,
        },
      })

      if (res.ok) {
        sent += 1
        details.push(`${scopeId}:${ev.id}`)
        await updateRoomCalendarEvent(ev.id, scopeId, {
          meta: {
            ...ev.meta,
            hourReminderSentAt: now.toISOString(),
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
