import { describe, expect, it } from 'vitest'
import {
  isBiologyTeacherGuideName,
  matchMuallimSeerahFile,
  pickMuallimSeerahFile,
  isMuallimSeerahShortQuery,
  scoreMuallimSeerahCandidate,
} from '@/lib/files/muallim-seerah-match'
import { filenamesStrictMatch } from '@/lib/telegram/file-jobs'

describe('muallim seerah short-name alias', () => {
  it('matches short and full seerah titles', () => {
    expect(matchMuallimSeerahFile('المعلم الاول.pdf')).toBe(true)
    expect(
      matchMuallimSeerahFile('المعلم الأول من معالم من السيرة النبوية.pdf')
    ).toBe(true)
    expect(isMuallimSeerahShortQuery('المعلم الأول')).toBe(true)
  })

  it('never matches biology teacher guide', () => {
    expect(isBiologyTeacherGuideName('دليل معلم الأحياء أول ثانوي.pdf')).toBe(
      true
    )
    expect(matchMuallimSeerahFile('دليل معلم الأحياء أول ثانوي.pdf')).toBe(
      false
    )
    expect(
      scoreMuallimSeerahCandidate('دليل معلم الأحياء.pdf')
    ).toBe(Number.NEGATIVE_INFINITY)
  })

  it('picks seerah over biology when both present', () => {
    const files = [
      { id: 'bio', originalName: 'دليل معلم الأحياء أول ثانوي ف1.pdf' },
      {
        id: 'seerah',
        originalName: 'المعلم الأول من معالم من السيرة النبوية.pdf',
      },
      { id: 'short', originalName: 'المعلم الاول.pdf' },
    ]
    const picked = pickMuallimSeerahFile(files, 'المعلم الاول')
    expect(picked?.id).toBe('seerah')
  })

  it('matches underscore + NFD hamza Telegram filenames', () => {
    expect(
      matchMuallimSeerahFile('المعلم_الأول_من_معالم_من_السيرة_النبوية.pdf')
    ).toBe(true)
    expect(
      filenamesStrictMatch(
        'المعلم الأول.pdf',
        'المعلم_الأول_من_معالم_من_السيرة_النبوية.pdf'
      )
    ).toBe(true)
  })
})
