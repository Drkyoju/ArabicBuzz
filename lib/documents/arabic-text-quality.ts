/**
 * Detect corrupt Arabic PDF ToUnicode / broken ligatures.
 * Used to refuse silent طلاسم on free text rebuild and prefer Drive / visual.
 */

const BROKEN_HINTS = [
  'املادة',
  'الالئحة',
  'االسم',
  'األساسية',
  'واألهداف',
  'االنتساب',
  'االجتمع',
  'املجلس',
]

export type ArabicTextQuality = {
  /** True when text looks like broken ToUnicode Arabic. */
  broken: boolean
  brokenHits: number
  badLig: number
  goodLig: number
  sampleAr?: string
}

export function assessArabicTextQuality(text: string): ArabicTextQuality {
  const t = text || ''
  const brokenHits = BROKEN_HINTS.filter((h) => t.includes(h)).length
  const badLig = (t.match(/اال|امل[^ا]|األ|واأل/g) || []).length
  const goodLig = (t.match(/ال[اأإآ]|الم[اأ]|وال/g) || []).length
  const arabicChars = (t.match(/[\u0600-\u06FF]/g) || []).length
  const broken =
    arabicChars > 40 &&
    (brokenHits >= 2 || (badLig > goodLig * 1.5 && badLig > 8))
  return {
    broken,
    brokenHits,
    badLig,
    goodLig,
    sampleAr: broken ? t.replace(/\s+/g, ' ').trim().slice(0, 80) : undefined,
  }
}

/** Arabic error when free rebuild would produce garbage. */
export function brokenToUnicodeErrorAr(opts?: {
  hasMac?: boolean
  hasGoogleHint?: boolean
}): string {
  const parts = [
    'طبقة النص في PDF العربي تبدو معطوبة (ToUnicode) — إعادة البناء النصية ستُنتج طلاسم.',
    'الأفضل: اربط Google من الإعدادات (Drive) لتحويل/OCR نظيف، أو أضف CLOUDCONVERT_API_KEY.',
  ]
  if (opts?.hasMac) {
    parts.push(
      'أو شغّل جسر الماك (MAC_SYNC_URL + npm run storage:sync) لنسخة Word مرئية (تخطيط 100%).'
    )
  }
  parts.push(
    'لن نُنتج Word بنص معطوب صامتاً. لفرض المسار النصّي رغم العطب مرّر forceBrokenRebuild=true (جودة منخفضة).'
  )
  return parts.join(' ')
}
