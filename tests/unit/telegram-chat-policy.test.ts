import { describe, expect, it } from 'vitest'
import {
  isTelegramFeedOnlyPost,
  shouldShowInRoomChat,
} from '@/lib/rooms/telegram-chat-policy'
import { isTelegramMediaImportEnvEnabled } from '@/lib/telegram/media-import'

describe('telegram chat policy — no text duplicates in room', () => {
  it('marks channel=telegram as feed-only', () => {
    expect(isTelegramFeedOnlyPost({ channel: 'telegram' })).toBe(true)
    expect(isTelegramFeedOnlyPost({ channel: 'TELEGRAM' })).toBe(true)
    expect(isTelegramFeedOnlyPost({ channel: 'whatsapp' })).toBe(false)
    expect(isTelegramFeedOnlyPost({ channel: null })).toBe(false)
    expect(isTelegramFeedOnlyPost({})).toBe(false)
  })

  it('hides telegram feed posts from room chat timeline', () => {
    expect(
      shouldShowInRoomChat({ channel: 'telegram', content: 'كم موعد؟' })
    ).toBe(false)
    expect(
      shouldShowInRoomChat({ channel: null, content: 'مرحبا من الغرفة' })
    ).toBe(true)
  })

  it('media import defaults ON via env', () => {
    const prev = process.env.TELEGRAM_MEDIA_IMPORT
    delete process.env.TELEGRAM_MEDIA_IMPORT
    expect(isTelegramMediaImportEnvEnabled()).toBe(true)
    process.env.TELEGRAM_MEDIA_IMPORT = '0'
    expect(isTelegramMediaImportEnvEnabled()).toBe(false)
    process.env.TELEGRAM_MEDIA_IMPORT = '1'
    expect(isTelegramMediaImportEnvEnabled()).toBe(true)
    if (prev === undefined) delete process.env.TELEGRAM_MEDIA_IMPORT
    else process.env.TELEGRAM_MEDIA_IMPORT = prev
  })
})
