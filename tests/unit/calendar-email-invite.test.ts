import { describe, expect, it } from 'vitest'
import {
  buildRoomCalendarInviteIcs,
  shouldSendCalendarEmailInvite,
} from '@/lib/rooms/calendar-email-invite'

describe('calendar email invite helpers', () => {
  it('defaults send ON when attendees present', () => {
    expect(shouldSendCalendarEmailInvite(undefined, ['a@x.sa'])).toBe(true)
    expect(shouldSendCalendarEmailInvite(true, ['a@x.sa'])).toBe(true)
    expect(shouldSendCalendarEmailInvite(false, ['a@x.sa'])).toBe(false)
    expect(shouldSendCalendarEmailInvite(undefined, [])).toBe(false)
  })

  it('builds METHOD:REQUEST ICS with Arabic summary and attendees', () => {
    const ics = buildRoomCalendarInviteIcs({
      event: {
        id: 'evt_test_1',
        titleAr: 'اجتماع اللجنة',
        descriptionAr: 'أجندة قصيرة',
        locationAr: 'القاعة',
        startsAt: '2026-08-14T07:00:00.000Z',
        endsAt: '2026-08-14T08:00:00.000Z',
        allDay: false,
        attendees: ['sara@company.sa', 'ahmed@gmail.com'],
      },
      organizerEmail: 'assoc@example.sa',
      organizerNameAr: 'جمعية الهدى والحكمة',
    })
    expect(ics).toContain('METHOD:REQUEST')
    expect(ics).toContain('SUMMARY:اجتماع اللجنة')
    expect(ics).toContain('mailto:sara@company.sa')
    expect(ics).toContain('mailto:ahmed@gmail.com')
    expect(ics).toContain('ORGANIZER')
    expect(ics).toContain('DTSTART;TZID=Asia/Riyadh:')
    expect(ics).toContain('END:VCALENDAR')
  })
})
