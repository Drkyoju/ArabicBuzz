/**
 * Detect corrupt Arabic PDF ToUnicode / broken ligatures / mojibake.
 * Used to refuse silent طلاسم on free text rebuild and prefer Drive / visual.
 * Also shared helpers for STT gibberish rejection.
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
  'االعضاء',
  'واالهداف',
]

/** Isolated / presentation-form heavy garbage often from broken PDF extract. */
const PRESENTATION_FORM_RE = /[\uFB50-\uFDFF\uFE70-\uFEFF]/g

export type ArabicTextQuality = {
  /** True when text looks like broken ToUnicode Arabic. */
  broken: boolean
  brokenHits: number
  badLig: number
  goodLig: number
  mojibakeHits: number
  sampleAr?: string
}

export function assessArabicTextQuality(text: string): ArabicTextQuality {
  const t = text || ''
  const brokenHits = BROKEN_HINTS.filter((h) => t.includes(h)).length
  const badLig = (t.match(/اال|امل[^ا]|األ|واأل|األ|الال/g) || []).length
  const goodLig = (t.match(/ال[اأإآ]|الم[اأ]|وال/g) || []).length
  const arabicChars = (t.match(/[\u0600-\u06FF]/g) || []).length
  const mojibakeHits =
    (t.match(/\uFFFD/g) || []).length +
    (t.match(/Ã.|Â.|Ø.|Ù.|Ø§|Ù„/g) || []).length
  const presentationForms = (t.match(PRESENTATION_FORM_RE) || []).length
  const presentationHeavy =
    arabicChars > 20 && presentationForms > arabicChars * 0.35

  const broken =
    (arabicChars > 40 &&
      (brokenHits >= 2 || (badLig > goodLig * 1.5 && badLig > 8))) ||
    mojibakeHits >= 3 ||
    presentationHeavy

  return {
    broken,
    brokenHits,
    badLig,
    goodLig,
    mojibakeHits,
    sampleAr: broken ? t.replace(/\s+/g, ' ').trim().slice(0, 80) : undefined,
  }
}

/** Arabic error when free rebuild would produce garbage. */
export function brokenToUnicodeErrorAr(opts?: {
  hasMac?: boolean
  hasGoogleHint?: boolean
  hasLibreOffice?: boolean
}): string {
  const parts = [
    'طبقة النص في PDF العربي تبدو معطوبة (ToUnicode) — إعادة البناء النصية ستُنتج طلاسم.',
    'الأفضل: اربط Google من الإعدادات (Drive) لتحويل/OCR نظيف، أو أضف CLOUDCONVERT_API_KEY.',
  ]
  if (opts?.hasLibreOffice) {
    parts.push('أو LibreOffice (soffice) محلياً إن وُجد في بيئة التشغيل.')
  }
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

/**
 * Split a line into spreadsheet cells without destroying Arabic words.
 * Prefers tabs / pipes / CSV commas; falls back to 2+ spaces (not single).
 */
export function splitLineToCells(line: string): string[] {
  const raw = String(line || '').trim()
  if (!raw) return ['']
  if (raw.includes('\t')) {
    return raw.split('\t').map((c) => c.trim())
  }
  if (raw.includes('|') && (raw.match(/\|/g) || []).length >= 1) {
    return raw
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => arr.length > 1 || i === 0)
  }
  // CSV-ish: comma with nearby non-space on both sides, ≥2 commas
  if ((raw.match(/,/g) || []).length >= 2 && !/،/.test(raw)) {
    return raw.split(',').map((c) => c.trim())
  }
  if (/\s{2,}/.test(raw)) {
    return raw.split(/\s{2,}/).map((c) => c.trim())
  }
  return [raw]
}

/**
 * Turn page/sheet text into Excel rows preserving Arabic cell text.
 */
export function textPagesToSheetRows(
  pages: Array<{ text: string; labelAr?: string; index?: number }>
): Array<{ name: string; rows: string[][] }> {
  const sheets = pages.map((p, i) => {
    const lines = p.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const rows = lines.map((line) => splitLineToCells(line))
    const name = (p.labelAr || `ورقة${p.index ?? i + 1}`).slice(0, 31)
    return { name, rows: rows.length ? rows : [['']] }
  })
  return sheets.filter((s) => s.rows.some((r) => r.some((c) => c.trim())))
}

/**
 * Flatten Excel-like sheet rows into Word paragraphs + optional table rows.
 */
export function sheetsToDocxBlocks(
  sheets: Array<{ name?: string; rows: Array<Array<string | number | boolean | null | undefined>> }>
): {
  paragraphs: string[]
  tables: Array<{ title?: string; rows: string[][] }>
} {
  const paragraphs: string[] = []
  const tables: Array<{ title?: string; rows: string[][] }> = []
  for (const sheet of sheets) {
    const title = (sheet.name || '').trim()
    const rows = (sheet.rows || []).map((row) =>
      (row || []).map((c) => (c == null ? '' : String(c).trim()))
    )
    const nonEmpty = rows.filter((r) => r.some((c) => c))
    if (!nonEmpty.length) continue
    const maxCols = Math.max(...nonEmpty.map((r) => r.length), 1)
    if (maxCols >= 2 && nonEmpty.length >= 2) {
      tables.push({ title: title || undefined, rows: nonEmpty })
    } else {
      if (title) paragraphs.push(title)
      for (const row of nonEmpty) {
        paragraphs.push(row.filter(Boolean).join(' — '))
      }
    }
  }
  return { paragraphs, tables }
}
