import { describe, expect, it } from 'vitest'
import {
  isPlausibleArabicTranscript,
  looksLikeArabicGibberish,
  raceArabicSttAttempts,
  scoreArabicTranscript,
} from '@/lib/audio/transcribe'

describe('isPlausibleArabicTranscript', () => {
  it('accepts normal MSA', () => {
    expect(isPlausibleArabicTranscript('حوّل الملف إلى PDF من فضلك')).toBe(true)
  })

  it('accepts short numeric confirmations', () => {
    expect(isPlausibleArabicTranscript('42')).toBe(true)
  })

  it('rejects Latin-only', () => {
    expect(isPlausibleArabicTranscript('convert this file please')).toBe(false)
  })

  it('rejects mojibake replacement char', () => {
    expect(isPlausibleArabicTranscript('ملف\uFFFD معطوب')).toBe(false)
  })

  it('rejects Franco-Arab without enough Arabic', () => {
    expect(isPlausibleArabicTranscript('yalla khalas wein el file')).toBe(false)
  })

  it('rejects repeated-syllable gibberish', () => {
    expect(
      isPlausibleArabicTranscript('لالالالالالالالالالالالالالالا')
    ).toBe(false)
  })

  it('rejects high word-repetition loops', () => {
    expect(
      isPlausibleArabicTranscript(
        'شكرا شكرا شكرا شكرا شكرا شكرا شكرا شكرا شكرا شكرا'
      )
    ).toBe(false)
  })
})

describe('looksLikeArabicGibberish / score', () => {
  it('scores coherent Arabic higher than thin noise', () => {
    const good = scoreArabicTranscript(
      'أريد تحويل جدول الأعضاء من إكسل إلى وورد'
    )
    const thin = scoreArabicTranscript('ا ب ت ث ج ح')
    expect(good).toBeGreaterThan(thin)
    expect(good).toBeGreaterThan(0)
  })

  it('flags low-entropy loops', () => {
    expect(looksLikeArabicGibberish('بابابابابابابابابابابابابا')).toBe(true)
  })
})

describe('raceArabicSttAttempts quality window', () => {
  it('prefers higher-quality Arabic within the window over a fast weak hit', async () => {
    const result = await raceArabicSttAttempts(
      [
        {
          provider: 'groq',
          providerLabelAr: 'fast-weak',
          run: async () => {
            await new Promise((r) => setTimeout(r, 5))
            return 'ا ب ت'
          },
        },
        {
          provider: 'gemini',
          providerLabelAr: 'slow-good',
          run: async () => {
            await new Promise((r) => setTimeout(r, 40))
            return 'حوّل ملف اللائحة إلى إكسل من فضلك'
          },
        },
      ],
      { qualityWindowMs: 200 }
    )
    expect(result?.provider).toBe('gemini')
    expect(result?.text).toContain('لائحة')
  })

  it('returns null when every attempt fails', async () => {
    const result = await raceArabicSttAttempts([
      { provider: 'groq', providerLabelAr: 'a', run: async () => null },
      {
        provider: 'gemini',
        providerLabelAr: 'b',
        run: async () => {
          throw new Error('fail')
        },
      },
    ])
    expect(result).toBeNull()
  })

  it('rejects gibberish winners so peers can win', async () => {
    const result = await raceArabicSttAttempts(
      [
        {
          provider: 'groq',
          providerLabelAr: 'junk',
          run: async () => 'لالالالالالالالالالالالالالا',
        },
        {
          provider: 'gemini',
          providerLabelAr: 'ok',
          run: async () => {
            await new Promise((r) => setTimeout(r, 30))
            return 'افتح الملف واحفظه'
          },
        },
      ],
      { qualityWindowMs: 150 }
    )
    expect(result?.provider).toBe('gemini')
  })
})
