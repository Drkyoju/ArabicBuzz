import { describe, expect, it } from 'vitest'
import { raceArabicSttAttempts } from '@/lib/audio/transcribe'

describe('raceArabicSttAttempts', () => {
  it('returns the first successful Arabic result', async () => {
    const result = await raceArabicSttAttempts([
      {
        provider: 'willow',
        providerLabelAr: 'slow',
        run: async () => {
          await new Promise((r) => setTimeout(r, 80))
          return 'نص بطيء'
        },
      },
      {
        provider: 'groq',
        providerLabelAr: 'fast',
        run: async () => {
          await new Promise((r) => setTimeout(r, 5))
          return 'نص سريع'
        },
      },
    ])
    expect(result?.text).toBe('نص سريع')
    expect(result?.provider).toBe('groq')
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
})
