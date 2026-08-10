import { describe, expect, it } from 'vitest'
import { formatZoomTopicAr } from '@/lib/zoom/topic-ar'

describe('formatZoomTopicAr', () => {
  it('maps Personal Meeting Room', () => {
    expect(formatZoomTopicAr('Personal Meeting Room')).toBe(
      'غرفة الاجتماع الشخصي'
    )
  })

  it('keeps Arabic titles', () => {
    expect(formatZoomTopicAr('اجتماع اللجنة')).toBe('اجتماع اللجنة')
  })

  it('prefixes other English topics', () => {
    expect(formatZoomTopicAr('Board Sync')).toMatch(/^اجتماع Zoom:/)
  })
})
