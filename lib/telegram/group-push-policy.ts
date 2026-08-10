/**
 * Unsolicited Telegram group push — OFF by default.
 *
 * Cron digests/reminders/nudges must not post to «عمل الجمعية» unless the
 * owner explicitly opts in via env. Silence is better than spam.
 *
 * Master: TELEGRAM_GROUP_PUSH=1 required for ANY scheduled group push.
 * Per-feature flags (also default OFF) further narrow what may fire.
 */

export type TelegramGroupPushFeature =
  | 'morning_digest'
  | 'weekly_group_digest'
  | 'overdue_nudge'
  | 'appointment_reminder'
  | 'deadline_reminder'
  | 'director_digest'
  | 'heartbeat'
  | 'scheduled_task'
  | 'imap_notify'
  | 'mail_energy'

const FEATURE_ENV: Record<TelegramGroupPushFeature, string> = {
  morning_digest: 'TELEGRAM_MORNING_DIGEST',
  weekly_group_digest: 'TELEGRAM_WEEKLY_GROUP_DIGEST',
  overdue_nudge: 'TELEGRAM_OVERDUE_NUDGE',
  appointment_reminder: 'TELEGRAM_APPOINTMENT_REMINDERS',
  deadline_reminder: 'TELEGRAM_DEADLINE_REMINDERS',
  director_digest: 'TELEGRAM_DIRECTOR_DIGEST',
  heartbeat: 'TELEGRAM_HEARTBEAT_PUSH',
  scheduled_task: 'TELEGRAM_SCHEDULED_TASK_PUSH',
  imap_notify: 'TELEGRAM_IMAP_NOTIFY',
  mail_energy: 'TELEGRAM_MAIL_ENERGY_PUSH',
}

/** True only when env is explicitly 1/true/yes/on (case-insensitive). */
export function isEnvFlagOn(raw: string | undefined | null): boolean {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

/** Master switch — must be on before any scheduled group push. */
export function isTelegramGroupPushMasterEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isEnvFlagOn(env.TELEGRAM_GROUP_PUSH)
}

export function isTelegramGroupPushFeatureEnabled(
  feature: TelegramGroupPushFeature,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const key = FEATURE_ENV[feature]
  return isEnvFlagOn(env[key])
}

/**
 * May this feature send unsolicited text to a Telegram group/chat?
 * Default: false (master OFF and/or feature OFF).
 */
export function isTelegramGroupPushAllowed(
  feature: TelegramGroupPushFeature,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!isTelegramGroupPushMasterEnabled(env)) return false
  return isTelegramGroupPushFeatureEnabled(feature, env)
}

export function telegramGroupPushDisabledReason(
  feature: TelegramGroupPushFeature,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (!isTelegramGroupPushMasterEnabled(env)) {
    return 'telegram_group_push_disabled'
  }
  if (!isTelegramGroupPushFeatureEnabled(feature, env)) {
    return `telegram_${feature}_disabled`
  }
  return 'allowed'
}

/** Public health / ops snapshot — no secrets. */
export function telegramGroupPushFlagsSnapshot(
  env: NodeJS.ProcessEnv = process.env
): {
  masterEnabled: boolean
  defaultPolicyAr: string
  features: Record<TelegramGroupPushFeature, boolean>
  envKeys: Record<TelegramGroupPushFeature, string>
} {
  const features = {} as Record<TelegramGroupPushFeature, boolean>
  for (const f of Object.keys(FEATURE_ENV) as TelegramGroupPushFeature[]) {
    features[f] = isTelegramGroupPushAllowed(f, env)
  }
  return {
    masterEnabled: isTelegramGroupPushMasterEnabled(env),
    defaultPolicyAr:
      'الإرسال التلقائي للمجموعة معطّل افتراضياً — لا ملخص/تذكير بلا طلب صريح وTELEGRAM_GROUP_PUSH=1',
    features,
    envKeys: { ...FEATURE_ENV },
  }
}
