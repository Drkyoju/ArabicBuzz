import { describe, expect, it } from 'vitest'
import {
  formatUnknownShortAr,
  looksLikeUnknownOrNotFound,
  resolveGroupReplyMode,
} from '@/lib/telegram/group-reply-policy'

describe('resolveGroupReplyMode', () => {
  it('DM is always full', () => {
    expect(
      resolveGroupReplyMode({
        inGroup: false,
        mentioned: false,
        isReplyToBot: false,
      })
    ).toBe('full')
  })

  it('group without mention is silent_execute', () => {
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: false,
      })
    ).toBe('silent_execute')
  })

  it('group @mention / reply / command → full', () => {
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: true,
        isReplyToBot: false,
      })
    ).toBe('full')
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: true,
      })
    ).toBe('full')
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: false,
        isCommand: true,
      })
    ).toBe('full')
  })
})

describe('looksLikeUnknownOrNotFound', () => {
  it('empty stays silent (not unknown)', () => {
    expect(looksLikeUnknownOrNotFound('')).toBe(false)
    expect(looksLikeUnknownOrNotFound('   ')).toBe(false)
  })

  it('detects Arabic unknown / not-found', () => {
    expect(looksLikeUnknownOrNotFound('ما عرفت كذا')).toBe(true)
    expect(looksLikeUnknownOrNotFound('ما حصلت هذا الملف')).toBe(true)
    expect(looksLikeUnknownOrNotFound('تم إنشاء الموعد بنجاح')).toBe(false)
  })
})

describe('formatUnknownShortAr', () => {
  it('maps to short stock lines', () => {
    expect(formatUnknownShortAr('ما عرفت الموعد')).toBe('ما عرفت كذا.')
    expect(formatUnknownShortAr('الملف غير موجود')).toBe('ما حصلت هذا.')
    expect(formatUnknownShortAr('')).toBe('ما عرفت كذا.')
  })
})
