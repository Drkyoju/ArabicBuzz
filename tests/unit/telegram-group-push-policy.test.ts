import { describe, expect, it } from 'vitest'
import {
  isEnvFlagOn,
  isTelegramGroupPushAllowed,
  isTelegramGroupPushMasterEnabled,
  isTelegramOwnerReminderDmAllowed,
  isTelegramSilenceUnsolicitedEnabled,
  maySendTelegramToChat,
  resolveTelegramOwnerDmChatId,
  telegramGroupPushDisabledReason,
  telegramGroupPushFlagsSnapshot,
} from '@/lib/telegram/group-push-policy'

describe('isEnvFlagOn', () => {
  it('accepts only explicit truthy values', () => {
    expect(isEnvFlagOn('1')).toBe(true)
    expect(isEnvFlagOn('true')).toBe(true)
    expect(isEnvFlagOn('YES')).toBe(true)
    expect(isEnvFlagOn('on')).toBe(true)
    expect(isEnvFlagOn('')).toBe(false)
    expect(isEnvFlagOn(undefined)).toBe(false)
    expect(isEnvFlagOn('0')).toBe(false)
    expect(isEnvFlagOn('false')).toBe(false)
  })
})

describe('TELEGRAM_SILENCE_UNSOLICITED — default ON', () => {
  it('is on when unset', () => {
    expect(isTelegramSilenceUnsolicitedEnabled({})).toBe(true)
  })

  it('turns off only with explicit 0/false/off', () => {
    expect(
      isTelegramSilenceUnsolicitedEnabled({ TELEGRAM_SILENCE_UNSOLICITED: '0' })
    ).toBe(false)
    expect(
      isTelegramSilenceUnsolicitedEnabled({
        TELEGRAM_SILENCE_UNSOLICITED: 'false',
      })
    ).toBe(false)
    expect(
      isTelegramSilenceUnsolicitedEnabled({ TELEGRAM_SILENCE_UNSOLICITED: '1' })
    ).toBe(true)
  })

  it('blocks group sends outside solicited meta', () => {
    const denied = maySendTelegramToChat({
      chatId: '-1003855925966',
      env: {},
    })
    expect(denied.ok).toBe(false)
    expect(denied.reason).toBe('telegram_silence_unsolicited')

    const allowedMeta = maySendTelegramToChat({
      chatId: '-1003855925966',
      meta: { inboundReply: true },
      env: {},
    })
    expect(allowedMeta.ok).toBe(true)

    const dm = maySendTelegramToChat({ chatId: '797686181', env: {} })
    expect(dm.ok).toBe(true)
  })
})

describe('telegram group push policy — default silence', () => {
  it('denies all features when env is empty (production default)', () => {
    const env = {} as NodeJS.ProcessEnv
    expect(isTelegramGroupPushMasterEnabled(env)).toBe(false)
    expect(isTelegramGroupPushAllowed('morning_digest', env)).toBe(false)
    expect(isTelegramGroupPushAllowed('weekly_group_digest', env)).toBe(false)
    expect(isTelegramGroupPushAllowed('appointment_reminder', env)).toBe(false)
    expect(isTelegramGroupPushAllowed('deadline_reminder', env)).toBe(false)
    expect(isTelegramGroupPushAllowed('overdue_nudge', env)).toBe(false)
    expect(isTelegramGroupPushAllowed('director_digest', env)).toBe(false)
    expect(isTelegramGroupPushAllowed('heartbeat', env)).toBe(false)
    expect(isTelegramGroupPushAllowed('scheduled_task', env)).toBe(false)
    expect(isTelegramGroupPushAllowed('imap_notify', env)).toBe(false)
    expect(isTelegramGroupPushAllowed('mail_energy', env)).toBe(false)
    expect(telegramGroupPushDisabledReason('morning_digest', env)).toBe(
      'telegram_silence_unsolicited'
    )
  })

  it('requires silence OFF + master AND feature flag', () => {
    const silenceOff = {
      TELEGRAM_SILENCE_UNSOLICITED: '0',
      TELEGRAM_GROUP_PUSH: '1',
    } as NodeJS.ProcessEnv
    expect(isTelegramGroupPushMasterEnabled(silenceOff)).toBe(true)
    expect(isTelegramGroupPushAllowed('morning_digest', silenceOff)).toBe(
      false
    )
    expect(telegramGroupPushDisabledReason('morning_digest', silenceOff)).toBe(
      'telegram_morning_digest_disabled'
    )

    const both = {
      TELEGRAM_SILENCE_UNSOLICITED: '0',
      TELEGRAM_GROUP_PUSH: '1',
      TELEGRAM_MORNING_DIGEST: '1',
    } as NodeJS.ProcessEnv
    expect(isTelegramGroupPushAllowed('morning_digest', both)).toBe(true)
    expect(isTelegramGroupPushAllowed('weekly_group_digest', both)).toBe(false)
  })

  it('snapshot reports silence on and every feature false by default', () => {
    const snap = telegramGroupPushFlagsSnapshot({})
    expect(snap.masterEnabled).toBe(false)
    expect(snap.silenceUnsolicited).toBe(true)
    expect(snap.ownerReminderDm).toBe(false)
    expect(Object.values(snap.features).every((v) => v === false)).toBe(true)
  })

  it('owner DM reminders allowed when private OWNER chat set and group silenced', () => {
    const env = {
      TELEGRAM_OWNER_CHAT_ID: '797686181',
    } as NodeJS.ProcessEnv
    expect(resolveTelegramOwnerDmChatId(env)).toBe('797686181')
    expect(isTelegramOwnerReminderDmAllowed('appointment_reminder', env)).toBe(
      true
    )
    expect(
      isTelegramOwnerReminderDmAllowed('appointment_reminder', {
        ...env,
        TELEGRAM_OWNER_REMINDERS: '0',
      })
    ).toBe(false)
    expect(
      resolveTelegramOwnerDmChatId({
        TELEGRAM_OWNER_CHAT_ID: '-1003855925966',
      })
    ).toBeNull()
  })
})
