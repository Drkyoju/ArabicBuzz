import { describe, expect, it } from 'vitest'
import { looksLikeArabicDraft } from '@/lib/audio/live-captions'

describe('looksLikeArabicDraft', () => {
  it('accepts short MSA request cues', () => {
    expect(looksLikeArabicDraft('أبغا')).toBe(true)
    expect(looksLikeArabicDraft('أبغا اللائحة')).toBe(true)
    expect(looksLikeArabicDraft('نعم')).toBe(true)
  })

  it('rejects latin gibberish', () => {
    expect(looksLikeArabicDraft('asdfgh qwerty')).toBe(false)
    expect(looksLikeArabicDraft('hello world')).toBe(false)
  })

  it('accepts mixed when arabic is substantial', () => {
    expect(looksLikeArabicDraft('أبغا file اللائحة')).toBe(true)
  })
})
