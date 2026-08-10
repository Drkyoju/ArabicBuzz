import { describe, expect, it, beforeEach } from 'vitest'
import {
  __resetTelegramChatInflightForTests,
  claimTelegramChatTurn,
  releaseTelegramChatTurn,
  telegramTurnFingerprint,
} from '@/lib/telegram/chat-inflight'
import {
  __resetTelegramUpdateDedupeForTests,
  claimTelegramMessageKey,
  claimTelegramUpdate,
} from '@/lib/telegram/update-dedupe'

describe('telegramTurnFingerprint', () => {
  it('prefers message id then update id then text hash', () => {
    expect(telegramTurnFingerprint({ messageId: 9, updateId: 1, text: 'x' })).toBe(
      'm9'
    )
    expect(telegramTurnFingerprint({ updateId: 42, text: 'x' })).toBe('u42')
    const a = telegramTurnFingerprint({ text: 'إحاطة الصباح' })
    const b = telegramTurnFingerprint({ text: 'إحاطة الصباح' })
    expect(a).toBe(b)
    expect(a.startsWith('t')).toBe(true)
  })
})

describe('claimTelegramChatTurn', () => {
  beforeEach(() => {
    __resetTelegramChatInflightForTests()
  })

  it('allows one in-flight turn per fingerprint and blocks duplicates', async () => {
    expect(await claimTelegramChatTurn('-1001', 'm10')).toBe(true)
    expect(await claimTelegramChatTurn('-1001', 'm10')).toBe(false)
    expect(await claimTelegramChatTurn('-1001', 'm11')).toBe(true)
  })

  it('blocks the same fingerprint after a successful answer', async () => {
    expect(await claimTelegramChatTurn('-1002', 'm20')).toBe(true)
    await releaseTelegramChatTurn('-1002', 'm20', { answered: true })
    expect(await claimTelegramChatTurn('-1002', 'm20')).toBe(false)
  })

  it('allows retry when the turn ended without answering', async () => {
    expect(await claimTelegramChatTurn('-1003', 'm30')).toBe(true)
    await releaseTelegramChatTurn('-1003', 'm30', { answered: false })
    expect(await claimTelegramChatTurn('-1003', 'm30')).toBe(true)
  })
})

describe('claimTelegramUpdate + message key', () => {
  beforeEach(() => {
    __resetTelegramUpdateDedupeForTests()
  })

  it('dedupes update_id and chat/message pairs', async () => {
    expect(await claimTelegramUpdate(77_001)).toBe(true)
    expect(await claimTelegramUpdate(77_001)).toBe(false)
    expect(await claimTelegramMessageKey(-10099, 501)).toBe(true)
    expect(await claimTelegramMessageKey(-10099, 501)).toBe(false)
    expect(await claimTelegramMessageKey(-10099, 502)).toBe(true)
    expect(await claimTelegramMessageKey(-10088, 501)).toBe(true)
  })
})
