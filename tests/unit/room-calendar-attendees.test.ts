import { describe, expect, it } from 'vitest'
import { parseAttendeeEmails } from '@/lib/rooms/room-calendar'

describe('parseAttendeeEmails', () => {
  it('accepts comma/semicolon-separated any-mailbox emails', () => {
    expect(
      parseAttendeeEmails('sara@company.sa, ahmed@gmail.com; nora@outlook.com')
    ).toEqual(['sara@company.sa', 'ahmed@gmail.com', 'nora@outlook.com'])
  })

  it('accepts arrays and dedupes case-insensitively', () => {
    expect(
      parseAttendeeEmails(['Sara@Company.sa', 'sara@company.sa', 'x@y.co'])
    ).toEqual(['sara@company.sa', 'x@y.co'])
  })

  it('drops placeholders and non-emails', () => {
    expect(
      parseAttendeeEmails('ok@real.sa, fake@example.com, not-an-email, local@arabicbuzz.local')
    ).toEqual(['ok@real.sa'])
  })

  it('returns empty for blank input', () => {
    expect(parseAttendeeEmails(undefined)).toEqual([])
    expect(parseAttendeeEmails('')).toEqual([])
    expect(parseAttendeeEmails([])).toEqual([])
  })
})
