import { describe, expect, it } from 'vitest'
import {
  isRoomChatRetentionUnlimited,
  roomChatRetentionDays,
  roomChatRetentionDaysForScope,
  roomChatRetentionLabelAr,
  ROOM_CHAT_RETENTION_DAYS_DEFAULT,
} from '@/lib/rooms/chat-retention'

describe('room chat retention', () => {
  it('defaults to 90 days globally', () => {
    const prev = process.env.ROOM_CHAT_RETENTION_DAYS
    delete process.env.ROOM_CHAT_RETENTION_DAYS
    expect(ROOM_CHAT_RETENTION_DAYS_DEFAULT).toBe(90)
    expect(roomChatRetentionDays()).toBe(90)
    if (prev === undefined) delete process.env.ROOM_CHAT_RETENTION_DAYS
    else process.env.ROOM_CHAT_RETENTION_DAYS = prev
  })

  it('shared-demo association room is unlimited by default', () => {
    const prev = process.env.ROOM_CHAT_RETENTION_UNLIMITED_SCOPES
    delete process.env.ROOM_CHAT_RETENTION_UNLIMITED_SCOPES
    expect(isRoomChatRetentionUnlimited('shared-demo')).toBe(true)
    expect(roomChatRetentionDaysForScope('shared-demo')).toBe(0)
    expect(roomChatRetentionLabelAr('shared-demo')).toMatch(/غير محدود/)
    if (prev === undefined) delete process.env.ROOM_CHAT_RETENTION_UNLIMITED_SCOPES
    else process.env.ROOM_CHAT_RETENTION_UNLIMITED_SCOPES = prev
  })

  it('personal desks use global retention window', () => {
    const prev = process.env.ROOM_CHAT_RETENTION_DAYS
    process.env.ROOM_CHAT_RETENTION_DAYS = '30'
    expect(roomChatRetentionDaysForScope('personal-u-abc')).toBe(30)
    process.env.ROOM_CHAT_RETENTION_DAYS = prev
  })
})
