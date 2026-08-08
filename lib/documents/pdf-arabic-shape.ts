/**
 * Arabic text shaping for pdf-lib drawText (no Node fs — safe for client burn-in).
 * Best-effort visual order; not a full bidi engine.
 */
export function shapeArabicForPdf(text: string): string {
  const hasAr = /[\u0600-\u06FF]/.test(text)
  if (!hasAr) return text
  // Keep Arabic letter order within words; reverse word order for RTL draw.
  // Avoid character-level reverse (which garbles connected Arabic).
  const words = text.split(/(\s+)/)
  const shaped = words.map((tok) => {
    if (!/[\u0600-\u06FF]/.test(tok)) return tok
    return tok
  })
  // Reverse at whitespace boundaries only
  const parts: string[] = []
  let buf: string[] = []
  const flush = () => {
    if (buf.length) {
      parts.push(...buf.reverse())
      buf = []
    }
  }
  for (const tok of shaped) {
    if (/^\s+$/.test(tok)) {
      flush()
      parts.push(tok)
    } else {
      buf.push(tok)
    }
  }
  flush()
  return parts.join('')
}
