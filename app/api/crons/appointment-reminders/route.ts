import { NextRequest, NextResponse } from 'next/server'
import {
  isTelegramGroupAppointmentRemindersAllowed,
  isTelegramOwnerReminderDmAllowed,
  telegramGroupPushFlagsSnapshot,
} from '@/lib/telegram/group-push-policy'

export const dynamic = 'force-dynamic'

/**
 * Narrow cron: appointment Telegram reminders only.
 * Safe to schedule while TELEGRAM_SILENCE_UNSOLICITED stays ON for digests —
 * does not run morning/weekly/file-job push suite.
 */
function authorize(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || ''
  const secret = process.env.CRON_SECRET || ''
  if (!secret) return false
  return header === `Bearer ${secret}` || alt === secret
}

export async function GET() {
  const snap = telegramGroupPushFlagsSnapshot()
  const ownerOk = isTelegramOwnerReminderDmAllowed('appointment_reminder')
  return NextResponse.json({
    ok: true,
    job: 'appointment_reminders',
    groupAppointmentReminders: snap.groupAppointmentReminders,
    ownerReminderDm: ownerOk,
    silenceUnsolicited: snap.silenceUnsolicited,
    willRun:
      snap.groupAppointmentReminders ||
      snap.features.appointment_reminder ||
      ownerOk,
    hintAr:
      'فعّل TELEGRAM_GROUP_APPOINTMENT_REMINDERS=1 على CranL لتذكير المجموعة قرب الموعد (بدون ملخصات). أو اترك TELEGRAM_OWNER_CHAT_ID خاصاً لتذكير المدير فقط.',
  })
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const groupNarrow = isTelegramGroupAppointmentRemindersAllowed()
  const ownerOk = isTelegramOwnerReminderDmAllowed('appointment_reminder')
  const snap = telegramGroupPushFlagsSnapshot()
  if (!groupNarrow && !snap.features.appointment_reminder && !ownerOk) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'appointment_reminders_disabled',
      telegramGroupPush: snap,
      messageAr:
        'تذكيرات المواعيد معطّلة — عيّن TELEGRAM_GROUP_APPOINTMENT_REMINDERS=1 للمجموعة أو TELEGRAM_OWNER_CHAT_ID للمدير.',
    })
  }

  const { runAppointmentTelegramReminders } = await import(
    '@/lib/rooms/appointment-reminders'
  )
  const result = await runAppointmentTelegramReminders({ now: new Date() })
  return NextResponse.json({
    ok: true,
    job: 'appointment_reminders',
    ...result,
    telegramGroupPush: telegramGroupPushFlagsSnapshot(),
  })
}
