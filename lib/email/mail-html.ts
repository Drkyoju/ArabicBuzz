/** Helpers for org-mail rich compose → SMTP HTML/plain parts. */

const EMAIL_FONT_STACK =
  "'IBM Plex Sans Arabic', Tahoma, 'Segoe UI', Arial, 'Traditional Arabic', sans-serif"

/** Turn plain AI/template draft into simple HTML paragraphs. */
export function plainTextToMailHtml(text: string): string {
  const t = text.trim()
  if (!t) return '<p></p>'
  if (/^<[a-z]/i.test(t)) return t
  return t
    .split(/\n{2,}/)
    .map((block) => {
      const lines = escapeHtml(block).replace(/\n/g, '<br/>')
      return `<p>${lines}</p>`
    })
    .join('')
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Strip tags for emptiness / plain-text SMTP part. */
export function htmlToPlainText(html: string): string {
  if (!html.trim()) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Wrap composer HTML in an email-safe RTL document so clients keep Arabic fonts
 * and direction. Inline styles preferred for Outlook/Gmail.
 */
export function wrapMailBodyHtml(innerHtml: string): string {
  const body = innerHtml.trim() || '<p></p>'
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:12px 16px;direction:rtl;text-align:right;font-family:${EMAIL_FONT_STACK};font-size:15px;line-height:1.7;color:#1c1917;">
<div dir="rtl" lang="ar" style="direction:rtl;text-align:right;font-family:${EMAIL_FONT_STACK};">
${body}
</div>
</body>
</html>`
}

export function quoteOriginalAsHtml(origHtml: string | null, origText: string | null): string {
  if (origHtml?.trim()) {
    return `<blockquote dir="auto" style="margin:1em 0 0;padding:0.5em 0.75em;border-inline-start:3px solid #a8a29e;color:#57534e;font-size:13px;">${origHtml}</blockquote>`
  }
  if (origText?.trim()) {
    const quoted = escapeHtml(origText.slice(0, 4000)).replace(/\n/g, '<br/>')
    return `<blockquote dir="auto" style="margin:1em 0 0;padding:0.5em 0.75em;border-inline-start:3px solid #a8a29e;color:#57534e;font-size:13px;">${quoted}</blockquote>`
  }
  return ''
}
