import { describe, expect, it } from 'vitest'
import {
  matchMuallimSeerahFile,
  isBiologyTeacherGuideName,
  isMuallimSeerahShortQuery,
} from '@/lib/files/muallim-seerah-match'
import { telegramFileNeverStoredAr } from '@/lib/telegram/attachment-persist'

describe('storage mesh aliases + no-resend policy', () => {
  it('المعلم الاول maps to seerah, never biology', () => {
    expect(isMuallimSeerahShortQuery('المعلم الاول')).toBe(true)
    expect(matchMuallimSeerahFile('المعلم الاول.pdf')).toBe(true)
    expect(
      matchMuallimSeerahFile('المعلم الأول من معالم من السيرة النبوية.pdf')
    ).toBe(true)
    expect(isBiologyTeacherGuideName('دليل معلم الأحياء.pdf')).toBe(true)
    expect(matchMuallimSeerahFile('دليل معلم الأحياء.pdf')).toBe(false)
  })

  it('missing-file copy never asks resend', () => {
    const msg = telegramFileNeverStoredAr('المعلم الاول.pdf')
    expect(msg).toMatch(/صامتة|بلا طلب إعادة إرسال/)
    expect(msg).not.toMatch(/أعد إرسال الملف عبر تيليجرام/)
    expect(msg).toMatch(/ممنوع استبدال.*أحياء|دليل أحياء/)
  })
})
