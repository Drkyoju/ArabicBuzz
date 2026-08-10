import { describe, expect, it } from 'vitest'
import {
  ASSOCIATION_NAME_AR,
  ASSOCIATION_TONE_RULES_AR,
  associationFallbackDraftBody,
  ensureAssociationToneFraming,
} from '@/lib/email/association-tone'
import { ORG_REPLY_TEMPLATES } from '@/lib/email/org-reply-templates'
import { buildAppointmentReminderTextAr } from '@/lib/rooms/appointment-reminders'

describe('association tone', () => {
  it('fallback draft opens and closes in association voice', () => {
    const body = associationFallbackDraftBody({
      subject: 'طلب دعم',
      attachmentNote: 'المرفقات: خطاب.pdf',
    })
    expect(body).toMatch(/^السلام عليكم ورحمة الله وبركاته/)
    expect(body).toMatch(ASSOCIATION_NAME_AR)
    expect(body).toMatch(/مع خالص التحية،\nإدارة الجمعية/)
    expect(ASSOCIATION_TONE_RULES_AR).toMatch(/ممنوع المبالغة/)
  })

  it('ensureAssociationToneFraming repairs missing framing', () => {
    const fixed = ensureAssociationToneFraming('نراجع طلبكم وسنرد قريباً.')
    expect(fixed).toMatch(/السلام عليكم/)
    expect(fixed).toMatch(/مع خالص التحية/)
  })

  it('org reply templates stay on association register', () => {
    expect(ORG_REPLY_TEMPLATES.length).toBeGreaterThanOrEqual(5)
    for (const t of ORG_REPLY_TEMPLATES) {
      expect(t.bodyAr).toMatch(/السلام عليكم ورحمة الله وبركاته/)
      expect(t.bodyAr).toMatch(/مع خالص التحية،\nإدارة الجمعية/)
    }
    expect(ORG_REPLY_TEMPLATES.some((t) => t.id === 'decline-polite')).toBe(
      true
    )
  })
})

describe('appointment reminder copy', () => {
  it('is clear once-only MSA without spammy emoji stack', () => {
    const text = buildAppointmentReminderTextAr({
      titleAr: 'اجتماع اللجنة',
      startsAt: '2026-08-10T14:00:00+03:00',
      locationAr: 'قاعة الاجتماعات',
      mins: 60,
      calendarUrl: 'https://arabicbuzz-fooc9h.cranl.net/?section=calendar',
    })
    expect(text).toMatch(/تذكير موعد \(مرة واحدة\)/)
    expect(text).toMatch(/اجتماع اللجنة/)
    expect(text).toMatch(/توقيت السعودية/)
    expect(text).toMatch(/لن نعيد هذا التذكير/)
    expect(text).toMatch(/قاعة الاجتماعات/)
    expect(text).not.toMatch(/⏰⏰/)
  })
})
