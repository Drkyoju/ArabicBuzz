/**
 * Weekly «ما ينتظر قرارك» digest for the association director (Resend + optional Telegram).
 */
import { listPendingApprovals } from '@/lib/agents/resolve-approval'
import { appBaseUrl } from '@/lib/app-url'
import { sendResendEmail } from '@/lib/email/resend'
import { emitNotification } from '@/lib/notifications/emit'
import { upcomingSystemDeadlines } from '@/lib/rooms/system-deadlines'
import { listRoomTasks } from '@/lib/rooms/room-tasks'

export type DirectorDigestResult = {
  ok: boolean
  emailSent: boolean
  telegramSent: boolean
  skipped?: boolean
  error?: string
  previewAr: string
  to?: string
}

import { getDirectorEmails } from '@/lib/auth/roles'

function directorEmail(): string | null {
  return (
    process.env.DIRECTOR_EMAIL?.trim() ||
    process.env.DIGEST_EMAIL?.trim() ||
    getDirectorEmails()[0] ||
    null
  )
}

export async function buildDirectorDigestAr(opts?: {
  scopeId?: string
  nameAr?: string
}): Promise<string> {
  const scopeId = opts?.scopeId || 'shared-demo'
  const nameAr =
    opts?.nameAr ||
    process.env.DIGEST_NAME_AR?.trim() ||
    'مدير الجمعية'
  const base = appBaseUrl()

  const [pending, deadlines, tasks] = await Promise.all([
    listPendingApprovals().catch(() => []),
    upcomingSystemDeadlines(scopeId, 45).catch(() => []),
    listRoomTasks(scopeId).catch(() => [] as Awaited<ReturnType<typeof listRoomTasks>>),
  ])

  const scopedPending = pending.filter(
    (p) => !p.scopeId || p.scopeId === scopeId
  )
  const openTasks = (Array.isArray(tasks) ? tasks : []).filter(
    (t) => t && (t.status === 'open' || t.status === 'in_progress')
  )

  const { isHitlDisabled } = await import('@/lib/security/posture')
  const hitlOff = isHitlDisabled()

  const lines = [
    `السلام عليكم ${nameAr}،`,
    '',
    '📋 ملخص أسبوعي للمدير — ما ينتظر قرارك (Arabic Buzz)',
    `يوم الخميس · توقيت الرياض · النطاق: ${scopeId}`,
    '',
  ]

  lines.push('── حوكمة الموافقات ──')
  if (hitlOff) {
    lines.push(
      '⚠️ الموافقات البشرية معطّلة حالياً (HITL_DISABLED) — التنفيذ فوري. للحوكمة: HITL_DISABLED=0 وDEFAULT_SECURITY_POSTURE=AUTO.'
    )
  } else if (scopedPending.length === 0) {
    lines.push('لا موافقات معلّقة — الحوكمة مفعّلة.')
  } else {
    lines.push(`${scopedPending.length} موافقة بانتظار قرارك:`)
    for (const p of scopedPending.slice(0, 12)) {
      const risk = p.riskLevel === 'HIGH' ? 'عالي' : 'منخفض'
      lines.push(`• ${p.actionName} · خطر ${risk}`)
    }
    if (scopedPending.length > 12) {
      lines.push(`…و${scopedPending.length - 12} أخرى`)
    }
  }

  lines.push('')
  lines.push('── مواعيد نظامية قادمة (امتثال) ──')
  if (!deadlines.length) {
    lines.push('لا مواعيد نظامية مسجّلة في الأسابيع القادمة.')
  } else {
    for (const d of deadlines.slice(0, 8)) {
      lines.push(
        `• ${d.labelAr} · ${d.startsAt}${d.daysLeft != null ? ` · متبقّي ${d.daysLeft} يوم` : ''}`
      )
    }
  }

  lines.push('')
  lines.push('── مهام الفريق المفتوحة ──')
  if (!openTasks.length) {
    lines.push('لا مهام مفتوحة بارزة.')
  } else {
    const inProgress = openTasks.filter((t) => t.status === 'in_progress')
    if (inProgress.length) {
      lines.push(`${inProgress.length} مهمة قيد التنفيذ.`)
    }
    for (const t of openTasks.slice(0, 8)) {
      const st = t.status === 'in_progress' ? 'قيد التنفيذ' : 'مفتوحة'
      lines.push(
        `• ${t.titleAr}${t.assigneeAr ? ` · ${t.assigneeAr}` : ''} · ${st}`
      )
    }
  }

  lines.push('')
  lines.push('── روابط سريعة ──')
  lines.push(`👉 الموافقات: ${base}/?section=approvals`)
  lines.push(`👉 لوحة اليوم: ${base}/`)
  lines.push(`👉 سجل التدقيق: ${base}/?section=audit`)
  lines.push('')
  lines.push('— Arabic Buzz · ملخص يُرسل أيضاً عبر تيليجرام عند ضبط البوت')

  return lines.join('\n')
}

export async function sendDirectorWeeklyDigest(opts?: {
  scopeId?: string
  nameAr?: string
  toEmail?: string
  channels?: Array<'email' | 'telegram'>
}): Promise<DirectorDigestResult> {
  const channels = opts?.channels?.length
    ? opts.channels
    : (['email', 'telegram'] as Array<'email' | 'telegram'>)
  const previewAr = await buildDirectorDigestAr(opts)
  const to = opts?.toEmail?.trim() || directorEmail()

  let emailSent = false
  let telegramSent = false
  let error: string | undefined

  if (channels.includes('email')) {
    if (!to) {
      error = 'DIRECTOR_EMAIL / DIGEST_EMAIL غير مضبوط'
    } else {
      const sent = await sendResendEmail({
        to,
        subject: 'ما ينتظر قرارك — ملخص أسبوعي | Arabic Buzz',
        text: previewAr,
      })
      emailSent = sent.ok
      if (!sent.ok) error = sent.error || error
      if (sent.skipped) error = sent.error || 'RESEND_API_KEY غير مضبوط'
    }
  }

  if (channels.includes('telegram')) {
    const tg = await emitNotification({
      channel: 'telegram',
      textAr: previewAr.slice(0, 3500),
      meta: { kind: 'director_digest', scopeId: opts?.scopeId || 'shared-demo' },
    })
    telegramSent = tg.ok
    if (!tg.ok && !error) {
      error = 'تعذّر إرسال تيليجرام (تحقق من TELEGRAM_BOT_TOKEN وCHAT_ID)'
    }
  }

  const ok = emailSent || telegramSent
  return {
    ok,
    emailSent,
    telegramSent,
    skipped: !ok && Boolean(error),
    error,
    previewAr,
    to: to || undefined,
  }
}

/** True on Thursday Asia/Riyadh (weekly director brief day). */
export function isDirectorDigestDay(now = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Riyadh',
    weekday: 'short',
  })
  return fmt.format(now) === 'Thu'
}
