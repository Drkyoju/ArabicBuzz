import { describe, expect, it, beforeEach } from 'vitest'
import {
  __resetDigestDayClaimsForTests,
  claimDigestDayKey,
} from '@/lib/digest/day-claim'
import { isMorningDigestWindow } from '@/lib/digest/morning-room'

describe('claimDigestDayKey', () => {
  beforeEach(() => {
    __resetDigestDayClaimsForTests()
  })

  it('allows the first claim and rejects the second for the same key', async () => {
    const key = 'morning:2099-01-01:-100test'
    expect(await claimDigestDayKey(key)).toBe(true)
    expect(await claimDigestDayKey(key)).toBe(false)
  })

  it('allows distinct day/chat keys', async () => {
    expect(await claimDigestDayKey('morning:2099-01-01:chat-a')).toBe(true)
    expect(await claimDigestDayKey('morning:2099-01-01:chat-b')).toBe(true)
  })
})

describe('isMorningDigestWindow', () => {
  it('is true at 08:00 Riyadh and false at 14:00 Riyadh', () => {
    // 08:00 Asia/Riyadh = 05:00 UTC
    const morning = new Date('2026-08-09T05:00:00.000Z')
    // 14:00 Asia/Riyadh = 11:00 UTC
    const afternoon = new Date('2026-08-09T11:00:00.000Z')
    expect(isMorningDigestWindow(morning)).toBe(true)
    expect(isMorningDigestWindow(afternoon)).toBe(false)
  })
})
