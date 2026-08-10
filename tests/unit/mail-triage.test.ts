import { describe, expect, it } from 'vitest'
import { classifyMailTriage } from '@/lib/email/mail-triage'

describe('classifyMailTriage', () => {
  it('marks urgent action as high priority', () => {
    const t = classifyMailTriage({
      subject: 'عاجل: يرجى الرد قبل الغد',
      snippet: 'مطلوب الرد خلال يوم',
      from: 'partner@example.com',
      seen: false,
    })
    expect(t.priority).toBe('high')
    expect(t.labelAr).toMatch(/أولوية|يتطلب/)
  })

  it('classifies newsletters as low without hiding', () => {
    const t = classifyMailTriage({
      subject: 'نشرة أخبار أسبوعية',
      from: 'noreply@news.example',
      snippet: 'unsubscribe',
      seen: true,
    })
    expect(t.priority).toBe('low')
    expect(t.classify).toBe('newsletter')
  })

  it('detects meeting hints', () => {
    const t = classifyMailTriage({
      subject: 'دعوة اجتماع Zoom',
      snippet: 'رابط المنصة',
      from: 'a@b.com',
    })
    expect(t.classify).toBe('meeting')
  })
})
