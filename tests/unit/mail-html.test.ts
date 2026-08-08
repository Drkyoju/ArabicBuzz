import { describe, expect, it } from 'vitest'
import {
  htmlToPlainText,
  plainTextToMailHtml,
  wrapMailBodyHtml,
} from '@/lib/email/mail-html'

describe('mail-html', () => {
  it('converts plain Arabic draft to paragraphs', () => {
    const html = plainTextToMailHtml('السلام عليكم\n\nشكراً لكم')
    expect(html).toContain('<p>')
    expect(html).toContain('السلام عليكم')
    expect(html).toContain('شكراً لكم')
  })

  it('wraps body as RTL email document', () => {
    const wrapped = wrapMailBodyHtml('<p><strong>مرحبا</strong></p>')
    expect(wrapped).toContain('lang="ar"')
    expect(wrapped).toContain('dir="rtl"')
    expect(wrapped).toContain('<strong>مرحبا</strong>')
    expect(wrapped).toContain('IBM Plex Sans Arabic')
  })

  it('strips html to plain text', () => {
    expect(htmlToPlainText('<p>أ<br/>ب</p>')).toMatch(/أ/)
    expect(htmlToPlainText('<p>أ<br/>ب</p>')).toMatch(/ب/)
  })
})
