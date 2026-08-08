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

  it('group actionable work without mention → full', () => {
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: false,
        workKind: 'file',
      })
    ).toBe('full')
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: false,
        workKind: 'question',
      })
    ).toBe('full')
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: false,
        workKind: 'appointment',
      })
    ).toBe('full')
  })

  it('group casual without mention → silent watch', () => {
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: false,
        workKind: 'casual',
      })
    ).toBe('silent_execute')
  })

  it('group @mention / reply / command → full even if casual', () => {
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: true,
        isReplyToBot: false,
        workKind: 'casual',
      })
    ).toBe('full')
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: true,
        workKind: 'casual',
      })
    ).toBe('full')
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: false,
        isCommand: true,
        workKind: 'casual',
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
