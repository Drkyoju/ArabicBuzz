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

function arabicCharCount(text: string): number {
  return (String(text || '').match(/[\u0600-\u06FF]/g) || []).length
}

/** Absolute: any طلاسم / U+FFFD / classic bylaws corruption. */
export function hasArabicMojibake(text: string): boolean {
  const t = String(text || '')
  if (!t.trim()) return false
  const q = assessArabicTextQuality(t)
  if (q.broken || q.mojibakeHits > 0) return true
  if (/الالئحة|األساسية|واألهداف|املادة|االسم/.test(t)) return true
  if (/\uFFFD/.test(t)) return true
  // Latin mojibake / CP1256-as-UTF8 style (common OCR export bugs)
  if (
    /Ã.|Â.|Ø.|Ù.|Ø§|Ù„|Ã©|Ã |Ð.|Ñ./.test(t) &&
    /[\u0600-\u06FF]/.test(t) === false
  ) {
    if (/Ã.|Â.|Ø.|Ù./.test(t)) return true
  }
  // Dense latin mojibake (UTF-8 misread as Latin-1 / CP1256)
  if (/(?:Ã.|Â.|Ø.|Ù.){3,}/.test(t)) return true
  // Reversed / nonsense stacks of isolated presentation forms mixed with wrong alef-lam
  if (/الال[^اأإآ]|األ[^ا-ي]/.test(t) && q.badLig >= 3) return true
  return false
}

export type ArabicTextCandidate = {
  text: string
  source: string
}

/**
 * Pick the longest clean Arabic candidate. Never returns mojibake when a
 * clean alternative exists; returns null if every candidate is garbage.
 * For non-Arabic (or light Arabic) text, returns the longest non-mojibake sample.
 */
export function pickBestCleanArabicText(
  candidates: ArabicTextCandidate[]
): { text: string; source: string; quality: ArabicTextQuality } | null {
  const scored = candidates
    .map((c) => {
      const text = String(c.text || '').trim()
      const quality = assessArabicTextQuality(text)
      const ar = arabicCharCount(text)
      const mojibake = hasArabicMojibake(text)
      const arabicHeavy = ar >= 40
      const clean = text.length >= 40 && !mojibake && (!arabicHeavy || ar >= 20)
      return { ...c, text, quality, ar, clean, arabicHeavy, mojibake }
    })
    .filter((c) => c.text.length >= 40)

  const cleanOnes = scored.filter((c) => c.clean)
  if (!cleanOnes.length) return null

  cleanOnes.sort((a, b) => {
    if (b.ar !== a.ar) return b.ar - a.ar
    if (b.text.length !== a.text.length) return b.text.length - a.text.length
    return a.quality.badLig - b.quality.badLig
  })
  const best = cleanOnes[0]!
  return { text: best.text, source: best.source, quality: best.quality }
}

/**
 * After Drive PDF→Office export: discard Drive entirely when Arabic gate fails.
 * Absolute rule — never ship Drive طلاسم even if local is imperfect (OCR next).
 */
export function preferLocalArabicOverDrive(opts: {
  driveText: string
  localText: string
}): {
  preferLocal: boolean
  discardDrive: boolean
  reasonAr?: string
  driveQ: ArabicTextQuality
  localQ: ArabicTextQuality
} {
  const driveText = String(opts.driveText || '')
  const localText = String(opts.localText || '')
  const driveQ = assessArabicTextQuality(driveText)
  const localQ = assessArabicTextQuality(localText)
  const localAr = arabicCharCount(localText)
  const driveAr = arabicCharCount(driveText)
  const arabicHeavy = localAr >= 40 || driveAr >= 40

  if (!arabicHeavy) {
    return { preferLocal: false, discardDrive: false, driveQ, localQ }
  }

  const driveBad =
    hasArabicMojibake(driveText) ||
    driveQ.broken ||
    driveQ.brokenHits >= 1 ||
    /الالئحة|األساسية|واألهداف/.test(driveText)

  if (driveBad) {
    return {
      preferLocal: true,
      discardDrive: true,
      reasonAr:
        'تصدير Google Drive أنتج طلاسم عربية (مثل الالئحة/األساسية) — نرفضه بالكامل ونُعيد البناء من أفضل استخراج محلي/OCR.',
      driveQ,
      localQ,
    }
  }

  // Drive looks clean but local is clearly better (more Arabic, no corruption)
  if (
    !localQ.broken &&
    localText.trim().length >= 80 &&
    localAr > driveAr * 1.15 &&
    localQ.goodLig >= driveQ.goodLig
  ) {
    return {
      preferLocal: true,
      discardDrive: false,
      reasonAr:
        'الاستخراج المحلي أوضح وأغنى من تصدير Drive — نفضّل إعادة البناء المحلية.',
      driveQ,
      localQ,
    }
  }

  return { preferLocal: false, discardDrive: false, driveQ, localQ }
}

const HEADING_RE =
  /^(الباب|الفصل|الفرع|المادة|الملحق|اللائحة|تعريف|التعريفات)\b/u

/**
 * Structure extracted MSA into clean RTL paragraphs + heading flags.
 * Collapses mojibake-adjacent whitespace; does not invent content.
 */
export function structureArabicParagraphs(text: string): Array<{
  text: string
  heading?: 1 | 2
}> {
  const raw = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\uFFFD/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!raw) return []

  const blocks = raw
    .split(/\n{2,}/)
    .flatMap((block) => {
      const lines = block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      // Single-line article headings often sit alone
      if (lines.length === 1) return lines
      // Keep multi-line blocks together unless they are article stacks
      const allHeadings = lines.every((l) => HEADING_RE.test(l))
      if (allHeadings) return lines
      return [lines.join('\n')]
    })
    .map((p) => p.trim())
    .filter(Boolean)

  return blocks.map((p) => {
    const first = p.split('\n')[0] || p
    if (/^(اللائحة\s+الأساسية|الباب\s+)/u.test(first)) {
      return { text: p, heading: 1 as const }
    }
    if (HEADING_RE.test(first) || /^المادة\s*[\d٠-٩]+/u.test(first)) {
      return { text: p, heading: 2 as const }
    }
    return { text: p }
  })
}

/** Soft refuse when Gemini→Paddle (and optional Mistral) cannot produce clean Arabic. */
export const CONVERT_OCR_REFUSE_AR =
  'تعذّر التحويل بنص عربي نظيف. لم نُنشئ ملفاً حتى لا يصلك طلاسم. جرّب أولاً الملف عبر Drive (بعد الربط من الإعدادات)، أو جسر الماك إن كان مضبوطاً؛ وإلا التحويل غير متاح حالياً على CranL — ولن ندّعي نجاحاً مزوّراً.'

/** LibreOffice missing on thin host (CranL) — honest Arabic, no fake success. */
export const CONVERT_LIBREOFFICE_UNAVAILABLE_AR =
  'LibreOffice غير متوفر على خادم CranL. جرّب: (١) شغّل sidecar مجاني: docker compose -f docker-compose.convert.yml up -d ثم عيّن CONVERT_SERVICE_URL على CranL، (٢) جسر الماك إن كان مستيقظاً (npm run mac-hop:health)، (٣) اربط Google من الإعدادات ثم حوّل عبر Drive. وإلا التحويل غير متاح صراحة — ممنوع ادّعاء نجاح أو تسليم طلاسم.'

/** Arabic error when free rebuild would produce garbage — user-facing, no engine ids. */
export function brokenToUnicodeErrorAr(opts?: {
  hasMac?: boolean
  hasGoogleHint?: boolean
  hasLibreOffice?: boolean
  hasMistral?: boolean
  hasPaddle?: boolean
}): string {
  const parts = [CONVERT_OCR_REFUSE_AR]
  if (opts?.hasGoogleHint) {
    parts.push('مسار Drive للملفات العربية متاح بعد الربط من الإعدادات.')
  }
  if (opts?.hasMac) {
    parts.push('جسر الماك اختياري للتحويل/OCR عند الحاجة.')
  }
  if (opts?.hasLibreOffice === false) {
    parts.push(CONVERT_LIBREOFFICE_UNAVAILABLE_AR)
  } else if (opts?.hasLibreOffice) {
    parts.push('LibreOffice متوفر لـ Word↔PDF عندما يكون النص نظيفاً.')
  }
  if (opts?.hasPaddle === false) {
    parts.push('محرّك OCR الاحتياطي غير مضبوط على هذه البيئة.')
  }
  parts.push(
    'إن وُجد شك في الجودة نُخبرك صراحة بدل تسليم ملف مضلّل.'
  )
  return parts.join(' ')
}

/** Soft refuse payload for convert_document / API / Telegram — never attach a bad file. */
export function convertRefuseResult(reasonAr: string, extra?: Record<string, unknown>) {
  return {
    ok: false as const,
    reason_ar: reasonAr,
    messageAr: reasonAr,
    error: reasonAr,
    attachments: [] as unknown[],
    ...(extra || {}),
  }
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
