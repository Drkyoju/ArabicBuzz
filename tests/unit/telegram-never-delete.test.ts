import { describe, expect, it } from 'vitest'
import {
  assertTelegramApiMethodAllowed,
  isTelegramDeleteApiMethod,
  telegramMethodFromUrl,
  telegramNeverDelete,
  TelegramNeverDeleteError,
  TELEGRAM_NEVER_DELETE_METHODS,
} from '@/lib/telegram/never-delete'

describe('telegram never-delete policy', () => {
  it('flags all banned Bot API methods', () => {
    for (const m of TELEGRAM_NEVER_DELETE_METHODS) {
      expect(isTelegramDeleteApiMethod(m)).toBe(true)
      expect(isTelegramDeleteApiMethod(m.toLowerCase())).toBe(true)
    }
  })

  it('allows send/edit and operational deleteWebhook', () => {
    expect(isTelegramDeleteApiMethod('sendMessage')).toBe(false)
    expect(isTelegramDeleteApiMethod('editMessageText')).toBe(false)
    expect(isTelegramDeleteApiMethod('deleteWebhook')).toBe(false)
    expect(isTelegramDeleteApiMethod('deleteMyCommands')).toBe(false)
    expect(isTelegramDeleteApiMethod('getMe')).toBe(false)
  })

  it('parses method from api.telegram.org URLs', () => {
    expect(
      telegramMethodFromUrl(
        'https://api.telegram.org/bot123:ABC/deleteMessage'
      )
    ).toBe('deleteMessage')
    expect(
      telegramMethodFromUrl(
        'https://api.telegram.org/bot123:ABC/sendMessage'
      )
    ).toBe('sendMessage')
  })

  it('telegramNeverDelete always throws', () => {
    expect(() => telegramNeverDelete('deleteMessage')).toThrow(
      TelegramNeverDeleteError
    )
  })

  it('assertTelegramApiMethodAllowed blocks deletes', () => {
    expect(() => assertTelegramApiMethodAllowed('deleteMessages')).toThrow(
      TelegramNeverDeleteError
    )
    expect(() => assertTelegramApiMethodAllowed('sendMessage')).not.toThrow()
  })
})
