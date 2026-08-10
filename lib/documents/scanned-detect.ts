/**
 * Detect image-only / scanned PDFs (no usable copy-paste text layer).
 * Used by read_document to trigger Arabic+English OCR page-by-page.
 */

import { assessArabicTextQuality } from '@/lib/documents/arabic-text-quality'

export type PageTextHint = {
  text: string
  charCount?: number
}

export type ScannedDetectResult = {
  /** True when most pages lack a usable text layer (scan / photo PDF). */
  scanned: boolean
  /** Share of pages that need OCR (0–1). */
  needOcrRatio: number
  emptyOrShort: number
  brokenToUnicode: number
  total: number
  reasonAr: string
}

const SHORT_PAGE = 40

/** A page needs OCR when empty, tiny, or broken Arabic ToUnicode. */
export function pageNeedsOcr(text: string): boolean {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  if (t.length < SHORT_PAGE) return true
  return assessArabicTextQuality(t).broken
}

/**
 * Heuristic: scanned / image-only PDF when ≥60% of pages need OCR,
 * or every page is empty/short (classic camera scan).
 */
export function detectScannedOrImageOnlyPdf(
  pages: PageTextHint[]
): ScannedDetectResult {
  const total = pages.length
  if (!total) {
    return {
      scanned: true,
      needOcrRatio: 1,
      emptyOrShort: 0,
      brokenToUnicode: 0,
      total: 0,
      reasonAr: 'لا طبقات نص مستخرجة — يُعامل كممسوح.',
    }
  }

  let emptyOrShort = 0
  let brokenToUnicode = 0
  for (const p of pages) {
    const t = (p.text || '').replace(/\s+/g, ' ').trim()
    const len = p.charCount ?? t.length
    if (len < SHORT_PAGE) emptyOrShort += 1
    else if (assessArabicTextQuality(t).broken) brokenToUnicode += 1
  }

  const need = emptyOrShort + brokenToUnicode
  const needOcrRatio = need / total
  const allShort = emptyOrShort === total
  const scanned = allShort || needOcrRatio >= 0.6

  let reasonAr = 'طبقة نص قابلة للنسخ متاحة.'
  if (allShort) {
    reasonAr =
      'PDF يبدو ممسوحاً/صور صفحات (لا نص يمكن نسخه) — سيُشغَّل OCR عربي+إنجليزي.'
  } else if (scanned && brokenToUnicode > 0) {
    reasonAr =
      'معظم الصفحات فارغة أو بطبقة ترميز نص تالفة — OCR صفحة بصفحة (عربي+إنجليزي).'
  } else if (scanned) {
    reasonAr =
      'أغلب الصفحات بلا نص صالح للنسخ — OCR تلقائي (جودة تعتمد على وضوح المسح).'
  }

  return {
    scanned,
    needOcrRatio,
    emptyOrShort,
    brokenToUnicode,
    total,
    reasonAr,
  }
}
