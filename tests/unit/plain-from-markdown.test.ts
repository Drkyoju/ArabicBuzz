import { describe, expect, it } from 'vitest'
import { plainFromMarkdown } from '@/lib/text/plain-from-markdown'

describe('plainFromMarkdown', () => {
  it('strips bold markers used in agent Telegram replies', () => {
    const raw =
      'لدينا اليوم **معدان** في تقويم الغرفة: 1. **اجتماع تشغيل فريق** - **يبدأ:** 08:24 مساءً'
    expect(plainFromMarkdown(raw)).toBe(
      'لدينا اليوم معدان في تقويم الغرفة: 1. اجتماع تشغيل فريق - يبدأ: 08:24 مساءً'
    )
  })

  it('keeps link labels and drops URLs', () => {
    expect(plainFromMarkdown('اقرأ [الملف](https://example.com)')).toBe(
      'اقرأ الملف'
    )
  })

  it('handles empty input', () => {
    expect(plainFromMarkdown(null)).toBe('')
    expect(plainFromMarkdown(undefined)).toBe('')
    expect(plainFromMarkdown('')).toBe('')
  })
})
