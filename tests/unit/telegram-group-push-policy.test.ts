import { describe, expect, it } from 'vitest'
import {
  isEnvFlagOn,
  isTelegramGroupPushAllowed,
  isTelegramGroupPushMasterEnabled,
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
      'telegram_group_push_disabled'
    )
  })

  it('requires master AND feature flag', () => {
    const masterOnly = {
      TELEGRAM_GROUP_PUSH: '1',
    } as NodeJS.ProcessEnv
    expect(isTelegramGroupPushMasterEnabled(masterOnly)).toBe(true)
    expect(isTelegramGroupPushAllowed('morning_digest', masterOnly)).toBe(false)
    expect(telegramGroupPushDisabledReason('morning_digest', masterOnly)).toBe(
      'telegram_morning_digest_disabled'
    )

    const both = {
      TELEGRAM_GROUP_PUSH: '1',
      TELEGRAM_MORNING_DIGEST: '1',
    } as NodeJS.ProcessEnv
    expect(isTelegramGroupPushAllowed('morning_digest', both)).toBe(true)
    expect(isTelegramGroupPushAllowed('weekly_group_digest', both)).toBe(false)
  })

  it('snapshot reports every feature false by default', () => {
    const snap = telegramGroupPushFlagsSnapshot({})
    expect(snap.masterEnabled).toBe(false)
    expect(Object.values(snap.features).every((v) => v === false)).toBe(true)
  })
})
