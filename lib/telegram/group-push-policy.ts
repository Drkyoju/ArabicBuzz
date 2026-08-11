/**
 * Unsolicited Telegram group push — OFF by default.
 *
 * Cron digests/reminders/nudges must not post to «عمل الجمعية» unless the
 * owner explicitly opts in via env. Silence is better than spam.
 *
 * Master: TELEGRAM_GROUP_PUSH=1 required for ANY scheduled group push.
 * Per-feature flags (also default OFF) further narrow what may fire.
 *
 * Absolute kill-switch: TELEGRAM_SILENCE_UNSOLICITED defaults ON when unset.
 * Group sendMessage/sendDocument blocked unless meta.inboundReply / meta.solicited
 * (set by server emit path when inside inbound webhook ALS).
 * Set TELEGRAM_SILENCE_UNSOLICITED=0 to allow opted-in group push features again.
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

/** True only when env is explicitly 0/false/no/off. */
export function isEnvFlagExplicitlyOff(
  raw: string | undefined | null
): boolean {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  return v === '0' || v === 'false' || v === 'no' || v === 'off'
}

/**
 * Absolute silence for unsolicited group sends.
 * DEFAULT ON when unset — must set TELEGRAM_SILENCE_UNSOLICITED=0 to allow
 * any cron/file-job/digest posts to groups.
 */
export function isTelegramSilenceUnsolicitedEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = env.TELEGRAM_SILENCE_UNSOLICITED
  if (raw == null || String(raw).trim() === '') return true
  if (isEnvFlagExplicitlyOff(raw)) return false
  return true
}

/** Telegram groups / supergroups / channels use negative chat ids. */
export function isTelegramGroupChatId(
  chatId: string | null | undefined
): boolean {
  const id = String(chatId || '').trim()
  return id.startsWith('-')
}

/**
 * May we send to this chat without an inbound update?
 * Groups: blocked while silence kill-switch is on, unless meta marks solicited.
 * Private chats: allowed (owner DM digests still gated by TELEGRAM_GROUP_PUSH).
 *
 * Note: inbound webhook ALS is applied in server emit helpers (not here) so this
 * module stays free of node:async_hooks for the client bundle.
 */
export function maySendTelegramToChat(opts: {
  chatId?: string | null
  meta?: Record<string, unknown>
  env?: NodeJS.ProcessEnv
}): { ok: boolean; reason: string } {
  const env = opts.env || process.env
  const chatId = String(opts.chatId || '').trim()
  if (!chatId) return { ok: false, reason: 'no_chat_id' }
  if (!isTelegramGroupChatId(chatId)) {
    return { ok: true, reason: 'private_chat' }
  }
  if (!isTelegramSilenceUnsolicitedEnabled(env)) {
    return { ok: true, reason: 'silence_disabled' }
  }
  const meta = opts.meta || {}
  if (meta.inboundReply === true || meta.solicited === true) {
    return { ok: true, reason: 'meta_solicited' }
  }
  return { ok: false, reason: 'telegram_silence_unsolicited' }
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
 * Default: false (silence ON and/or master OFF and/or feature OFF).
 */
export function isTelegramGroupPushAllowed(
  feature: TelegramGroupPushFeature,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (isTelegramSilenceUnsolicitedEnabled(env)) return false
  if (!isTelegramGroupPushMasterEnabled(env)) return false
  return isTelegramGroupPushFeatureEnabled(feature, env)
}

export function telegramGroupPushDisabledReason(
  feature: TelegramGroupPushFeature,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (isTelegramSilenceUnsolicitedEnabled(env)) {
    return 'telegram_silence_unsolicited'
  }
  if (!isTelegramGroupPushMasterEnabled(env)) {
    return 'telegram_group_push_disabled'
  }
  if (!isTelegramGroupPushFeatureEnabled(feature, env)) {
    return `telegram_${feature}_disabled`
  }
  return 'allowed'
}

/**
 * Private owner DM chat for selective reminders (never a group id).
 * Uses TELEGRAM_OWNER_CHAT_ID only when it is a private (non-negative) chat.
 */
export function resolveTelegramOwnerDmChatId(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const id = String(env.TELEGRAM_OWNER_CHAT_ID || '').trim()
  if (!id || isTelegramGroupChatId(id)) return null
  return id
}

export type TelegramOwnerReminderFeature =
  | 'appointment_reminder'
  | 'deadline_reminder'

/**
 * Safe owner-DM reminders while group push / silence blocks the association group.
 * Default ON when a private TELEGRAM_OWNER_CHAT_ID exists; set
 * TELEGRAM_OWNER_REMINDERS=0 to disable. Never re-enables morning digests or group spam.
 */
export function isTelegramOwnerReminderDmAllowed(
  feature: TelegramOwnerReminderFeature,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (isTelegramGroupPushAllowed(feature, env)) return false
  if (isEnvFlagExplicitlyOff(env.TELEGRAM_OWNER_REMINDERS)) return false
  return Boolean(resolveTelegramOwnerDmChatId(env))
}

/** Public health / ops snapshot — no secrets. */
export function telegramGroupPushFlagsSnapshot(
  env: NodeJS.ProcessEnv = process.env
): {
  masterEnabled: boolean
  silenceUnsolicited: boolean
  silenceDefaultOn: true
  ownerReminderDm: boolean
  ownerReminderDmChatConfigured: boolean
  defaultPolicyAr: string
  features: Record<TelegramGroupPushFeature, boolean>
  envKeys: Record<TelegramGroupPushFeature, string>
} {
  const features = {} as Record<TelegramGroupPushFeature, boolean>
  for (const f of Object.keys(FEATURE_ENV) as TelegramGroupPushFeature[]) {
    features[f] = isTelegramGroupPushAllowed(f, env)
  }
  const ownerDm = resolveTelegramOwnerDmChatId(env)
  return {
    masterEnabled: isTelegramGroupPushMasterEnabled(env),
    silenceUnsolicited: isTelegramSilenceUnsolicitedEnabled(env),
    silenceDefaultOn: true,
    ownerReminderDm: isTelegramOwnerReminderDmAllowed(
      'appointment_reminder',
      env
    ),
    ownerReminderDmChatConfigured: Boolean(ownerDm),
    defaultPolicyAr:
      'صمت مطلق للمجموعة افتراضياً (TELEGRAM_SILENCE_UNSOLICITED) — لا إرسال بلا رد على تحديث وارد؛ الملخصات تحتاج أيضاً TELEGRAM_GROUP_PUSH=1؛ تذكيرات انتقائية للمدير فقط عبر DM إن وُجد TELEGRAM_OWNER_CHAT_ID خاص',
    features,
    envKeys: { ...FEATURE_ENV },
  }
}
