/**
 * Page-by-page / chunked full-file document reading for agents.
 * Ensures long PDF/DOCX/PPTX/XLSX are not silently truncated mid-word.
 *
 * Strategy:
 *  - PDF: pdfjs text per page; optional OCR per page via Mac/tesseract cascade
 *  - DOCX: mammoth paragraphs → character chunks (and media OCR when empty)
 *  - PPTX: slide-by-slide via officeparser / pptx zip XML
 *  - XLSX: sheet-by-sheet via exceljs
 */

import path from 'node:path'
import { assessArabicTextQuality } from '@/lib/documents/arabic-text-quality'
import {
  detectScannedOrImageOnlyPdf,
  pageNeedsOcr,
} from '@/lib/documents/scanned-detect'
import { runArabicOcr } from '@/lib/rag/ocr'
import {
  macPageOcr,
  macSyncConfigured,
} from '@/lib/storage/mac-sync-client'

export type DocPageChunk = {
  /** 1-based page / slide / sheet index */
  index: number
  labelAr: string
  text: string
  charCount: number
  ocrUsed?: boolean
  quality?: 'ok' | 'empty' | 'broken-tounicode' | 'ocr'
}

export type ReadPagesResult = {
  ok: boolean
  kind: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'text' | 'image' | 'unknown'
  totalUnits: number
  /** Units returned in this call (after pageStart/pageEnd or chunk window) */
  returnedUnits: number
  pageStart: number
  pageEnd: number
  charOffset: number
  maxChars: number
  truncated: boolean
  hasMore: boolean
  nextPageStart?: number
  nextCharOffset?: number
  pages: DocPageChunk[]
  /** Concatenated text for this window only */
  text: string
  charCount: number
  totalCharCount: number
  extractMethod: string
  ocrUsed: boolean
  warningAr?: string
  messageAr: string
}

const DEFAULT_MAX_CHARS = 18_000

function unitLabel(kind: ReadPagesResult['kind'], index: number): string {
  if (kind === 'pdf' || kind === 'docx') return `صفحة ${index}`
  if (kind === 'pptx') return `شريحة ${index}`
  if (kind === 'xlsx') return `ورقة ${index}`
  return `مقطع ${index}`
}

async function extractPdfPages(buffer: Buffer): Promise<DocPageChunk[]> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableWorker: true,
    } as never)
    const doc = await loadingTask.promise
    const pages: DocPageChunk[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const strings = (content.items as Array<{ str?: string }>)
        .map((it) => it.str || '')
        .filter(Boolean)
      const text = strings.join(' ').replace(/\s+/g, ' ').trim()
      const q = assessArabicTextQuality(text)
      pages.push({
        index: i,
        labelAr: `صفحة ${i}`,
        text,
        charCount: text.length,
        quality: !text
          ? 'empty'
          : q.broken
            ? 'broken-tounicode'
            : 'ok',
      })
    }
    return pages
  } catch {
    // Fallback: pdf-parse whole file as one unit
    try {
      const pdfMod = await import('pdf-parse')
      const pdfParse =
        (pdfMod as { default?: (b: Buffer) => Promise<{ text: string }> })
          .default ||
        (pdfMod as unknown as (b: Buffer) => Promise<{ text: string }>)
      const parsed = await pdfParse(buffer)
      const raw = (parsed.text || '').trim()
      // Split on form feed if present
      const parts = raw.includes('\f')
        ? raw.split(/\f/)
        : [raw]
      return parts.map((t, i) => {
        const text = t.replace(/\s+/g, ' ').trim()
        const q = assessArabicTextQuality(text)
        return {
          index: i + 1,
          labelAr: `صفحة ${i + 1}`,
          text,
          charCount: text.length,
          quality: !text
            ? 'empty'
            : q.broken
              ? 'broken-tounicode'
              : 'ok',
        }
      })
    } catch {
      return []
    }
  }
}

async function extractDocxPages(buffer: Buffer): Promise<DocPageChunk[]> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  const full = (result.value || '').trim()

  // Visual DOCX (page images only): OCR each embedded image
  if (!full || full.length < 20) {
    try {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(buffer)
      const media = Object.keys(zip.files)
        .filter((n) => n.startsWith('word/media/'))
        .sort()
      if (media.length) {
        const pages: DocPageChunk[] = []
        for (let i = 0; i < media.length; i++) {
          const entry = zip.files[media[i]]
          const imgBuf = Buffer.from(await entry.async('nodebuffer'))
          const name = path.basename(media[i])
          let text = ''
          let ocrUsed = false
          try {
            const ocr = await runArabicOcr({
              buffer: imgBuf,
              filename: name,
              mimeType: guessImageMime(name),
            })
            text = (ocr.text || '').trim()
            ocrUsed = Boolean(text)
          } catch {
            /* keep empty */
          }
          pages.push({
            index: i + 1,
            labelAr: `صفحة ${i + 1}`,
            text,
            charCount: text.length,
            ocrUsed,
            quality: text ? 'ocr' : 'empty',
          })
        }
        return pages
      }
    } catch {
      /* fall through */
    }
  }

  // Paragraph groups as logical pages (~2500 chars) so agents can walk the file
  const paras = full
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (!paras.length) {
    return [
      {
        index: 1,
        labelAr: 'صفحة 1',
        text: full,
        charCount: full.length,
        quality: full ? 'ok' : 'empty',
      },
    ]
  }
  const pages: DocPageChunk[] = []
  let buf: string[] = []
  let size = 0
  let idx = 1
  const flush = () => {
    if (!buf.length) return
    const text = buf.join('\n\n')
    pages.push({
      index: idx++,
      labelAr: `مقطع ${pages.length + 1}`,
      text,
      charCount: text.length,
      quality: 'ok',
    })
    buf = []
    size = 0
  }
  for (const p of paras) {
    if (size + p.length > 2500 && buf.length) flush()
    buf.push(p)
    size += p.length + 2
  }
  flush()
  return pages.map((p, i) => ({
    ...p,
    index: i + 1,
    labelAr: `مقطع ${i + 1}`,
  }))
}

function guessImageMime(name: string): string {
  const l = name.toLowerCase()
  if (l.endsWith('.png')) return 'image/png'
  if (l.endsWith('.jpg') || l.endsWith('.jpeg')) return 'image/jpeg'
  if (l.endsWith('.webp')) return 'image/webp'
  if (l.endsWith('.tif') || l.endsWith('.tiff')) return 'image/tiff'
  return 'image/png'
}

async function extractPptxSlides(buffer: Buffer): Promise<DocPageChunk[]> {
  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buffer)
    const slideNames = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
      .sort((a, b) => {
        const na = Number(a.match(/slide(\d+)/i)?.[1] || 0)
        const nb = Number(b.match(/slide(\d+)/i)?.[1] || 0)
        return na - nb
      })
    const pages: DocPageChunk[] = []
    for (let i = 0; i < slideNames.length; i++) {
      const xml = await zip.files[slideNames[i]].async('string')
      const texts = Array.from(xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)).map(
        (m) => m[1]
      )
      const text = texts.join(' ').replace(/\s+/g, ' ').trim()
      pages.push({
        index: i + 1,
        labelAr: `شريحة ${i + 1}`,
        text,
        charCount: text.length,
        quality: text ? 'ok' : 'empty',
      })
    }
    if (pages.length) return pages
  } catch {
    /* fall through */
  }
  const mod = await import('officeparser')
  const parseOffice =
    (mod as { parseOffice?: typeof mod.parseOffice }).parseOffice ||
    (mod as { default?: { parseOffice?: typeof mod.parseOffice } }).default
      ?.parseOffice
  if (!parseOffice) return []
  const ast: unknown = await parseOffice(buffer, { fileType: 'pptx' })
  let text = ''
  if (
    ast &&
    typeof ast === 'object' &&
    typeof (ast as { to?: (f: string) => Promise<string> }).to === 'function'
  ) {
    text = String(
      await (ast as { to: (f: string) => Promise<string> }).to('text')
    ).trim()
  } else if (typeof ast === 'string') {
    text = ast.trim()
  }
  return [
    {
      index: 1,
      labelAr: 'شريحة 1',
      text,
      charCount: text.length,
      quality: text ? 'ok' : 'empty',
    },
  ]
}

async function extractXlsxSheets(buffer: Buffer): Promise<DocPageChunk[]> {
  const ExcelJS = await import('exceljs')
  const WorkbookCtor =
    (ExcelJS as { Workbook?: new () => import('exceljs').Workbook }).Workbook ||
    (ExcelJS as { default?: { Workbook: new () => import('exceljs').Workbook } })
      .default?.Workbook
  if (!WorkbookCtor) return []
  const wb = new WorkbookCtor()
  await wb.xlsx.load(buffer as never)
  const pages: DocPageChunk[] = []
  let i = 0
  wb.eachSheet((sheet) => {
    i += 1
    const lines: string[] = [`## ${sheet.name}`]
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as unknown[])
        .slice(1)
        .map((v) => {
          if (v == null) return ''
          if (typeof v === 'object' && v !== null && 'text' in (v as object)) {
            return String((v as { text?: unknown }).text ?? '')
          }
          return String(v)
        })
        .filter((s) => s.trim())
      if (vals.length) lines.push(vals.join('\t'))
    })
    const text = lines.join('\n').trim()
    pages.push({
      index: i,
      labelAr: `ورقة ${i} (${sheet.name})`,
      text,
      charCount: text.length,
      quality: text.length > 3 ? 'ok' : 'empty',
    })
  })
  return pages
}

async function ocrViaMacTesseract(
  buffer: Buffer,
  filename: string,
  pageIndex: number
): Promise<string | null> {
  if (!macSyncConfigured()) return null
  try {
    const res = await macPageOcr({
      buffer,
      filename,
      page: pageIndex,
      lang: 'ara+eng',
    })
    return (res.text || '').trim() || null
  } catch {
    return null
  }
}

/** Cap OCR pages per read_document call (agent loops with nextPageStart). */
const OCR_PAGES_PER_CALL = 8

/**
 * Read a document window: pages [pageStart..pageEnd] and/or char chunk.
 * Agents should loop with nextPageStart until hasMore=false.
 */
export async function readDocumentPages(opts: {
  buffer: Buffer
  filename: string
  mimeType?: string
  pageStart?: number
  pageEnd?: number
  charOffset?: number
  maxChars?: number
  enableOcr?: boolean
}): Promise<ReadPagesResult> {
  const filename = opts.filename || 'document.bin'
  const mime = opts.mimeType || 'application/octet-stream'
  const lower = filename.toLowerCase()
  const pageStart = Math.max(1, Math.floor(opts.pageStart || 1))
  const maxChars = Math.max(2_000, Math.min(opts.maxChars || DEFAULT_MAX_CHARS, 40_000))
  const charOffset = Math.max(0, Math.floor(opts.charOffset || 0))
  const enableOcr = opts.enableOcr !== false

  let kind: ReadPagesResult['kind'] = 'unknown'
  let all: DocPageChunk[] = []
  let extractMethod = 'none'

  if (lower.endsWith('.pdf') || mime.includes('pdf')) {
    kind = 'pdf'
    all = await extractPdfPages(opts.buffer)
    extractMethod = 'pdfjs-pages'
  } else if (lower.endsWith('.docx') || mime.includes('wordprocessingml')) {
    kind = 'docx'
    all = await extractDocxPages(opts.buffer)
    extractMethod = all.some((p) => p.ocrUsed) ? 'docx-media-ocr' : 'docx-chunks'
  } else if (
    lower.endsWith('.pptx') ||
    mime.includes('presentationml') ||
    mime.includes('ms-powerpoint')
  ) {
    kind = 'pptx'
    all = await extractPptxSlides(opts.buffer)
    extractMethod = 'pptx-slides'
  } else if (
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    mime.includes('spreadsheet')
  ) {
    kind = 'xlsx'
    all = await extractXlsxSheets(opts.buffer)
    extractMethod = 'xlsx-sheets'
  } else if (mime.startsWith('image/') || /\.(png|jpe?g|webp|tif{1,2}|bmp|gif)$/i.test(lower)) {
    kind = 'image'
    let text = ''
    let ocrUsed = false
    let extractNote = 'image-ocr'
    if (enableOcr) {
      // Free path first: Mac Tesseract ara+eng (same endpoint as PDF pages)
      const macText = await ocrViaMacTesseract(opts.buffer, filename, 1)
      if (macText) {
        text = macText
        ocrUsed = true
        extractNote = 'image-ocr-tesseract-mac'
      } else {
        const ocr = await runArabicOcr({
          buffer: opts.buffer,
          filename,
          mimeType: mime.startsWith('image/') ? mime : guessImageMime(filename),
        })
        text = (ocr.text || '').trim()
        ocrUsed = Boolean(text)
        if (text) extractNote = `image-ocr-${ocr.provider}`
      }
    }
    all = [
      {
        index: 1,
        labelAr: 'صورة 1',
        text,
        charCount: text.length,
        ocrUsed,
        quality: text ? 'ocr' : 'empty',
      },
    ]
    extractMethod = extractNote
  } else {
    kind = 'text'
    const text = opts.buffer.toString('utf8').replace(/\0/g, '').trim()
    all = [
      {
        index: 1,
        labelAr: 'مقطع 1',
        text,
        charCount: text.length,
        quality: text ? 'ok' : 'empty',
      },
    ]
    extractMethod = 'plain'
  }

  if (!all.length) {
    return {
      ok: false,
      kind,
      totalUnits: 0,
      returnedUnits: 0,
      pageStart,
      pageEnd: pageStart,
      charOffset,
      maxChars,
      truncated: false,
      hasMore: false,
      pages: [],
      text: '',
      charCount: 0,
      totalCharCount: 0,
      extractMethod,
      ocrUsed: false,
      messageAr: `تعذّر قراءة «${filename}».`,
      warningAr: 'لا وحدات مستخرجة.',
    }
  }

  const totalUnits = all.length
  const pageEndReq = opts.pageEnd
    ? Math.min(totalUnits, Math.floor(opts.pageEnd))
    : totalUnits

  // OCR empty / scanned / broken PDF pages in the requested window (bounded)
  let ocrUsed = all.some((p) => p.ocrUsed)
  let scannedWarning: string | undefined
  if (enableOcr && kind === 'pdf') {
    const scan = detectScannedOrImageOnlyPdf(all)
    if (scan.scanned) {
      scannedWarning = `${scan.reasonAr} الجودة تعتمد على وضوح المسح — مسار مجاني (Tesseract ara+eng على الماك أو Gemini).`
      extractMethod = 'pdf-scanned-ocr'
    }

    const window = all.slice(pageStart - 1, pageEndReq)
    const needOcr = window.filter(
      (p) =>
        pageNeedsOcr(p.text) ||
        p.quality === 'empty' ||
        p.quality === 'broken-tounicode'
    )
    // Cap OCR pages per call — agent continues with nextPageStart
    for (const page of needOcr.slice(0, OCR_PAGES_PER_CALL)) {
      const macText = await ocrViaMacTesseract(opts.buffer, filename, page.index)
      if (macText) {
        page.text = macText
        page.charCount = macText.length
        page.ocrUsed = true
        page.quality = 'ocr'
        ocrUsed = true
        continue
      }
      // Cloud cascade once for the first page in window (Gemini/Qari on PDF/image)
      if (page.index === pageStart && page.quality !== 'ocr') {
        try {
          const ocr = await runArabicOcr({
            buffer: opts.buffer,
            filename,
            mimeType: mime,
          })
          if (ocr.text?.trim()) {
            page.text = ocr.text.trim()
            page.charCount = page.text.length
            page.ocrUsed = true
            page.quality = 'ocr'
            ocrUsed = true
            extractMethod = `${extractMethod}+${ocr.provider}`
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  const totalCharCount = all.reduce((n, p) => n + p.charCount, 0)

  // Build window text respecting maxChars + charOffset across selected pages
  const selected = all.slice(pageStart - 1, pageEndReq)
  const parts: string[] = []
  let used = 0
  let lastIncluded = pageStart - 1
  for (const p of selected) {
    const header = `--- ${p.labelAr || unitLabel(kind, p.index)} ---\n`
    const block = header + (p.text || '')
    if (used === 0 && charOffset > 0) {
      // Apply offset only to first included page stream
      const joined = selected.map((x) => x.text).join('\n\n')
      const slice = joined.slice(charOffset, charOffset + maxChars)
      const truncated = charOffset + maxChars < joined.length
      const nextOff = truncated ? charOffset + maxChars : undefined
      const brokenAny = selected.some((x) => x.quality === 'broken-tounicode')
      const warnParts = [
        scannedWarning,
        brokenAny
          ? 'طبقة ToUnicode قد تكون معطوبة — فضّل OCR صفحة بصفحة أو تحويل Google Drive.'
          : undefined,
      ].filter(Boolean)
      return {
        ok: true,
        kind,
        totalUnits,
        returnedUnits: selected.length,
        pageStart,
        pageEnd: pageEndReq,
        charOffset,
        maxChars,
        truncated,
        hasMore: truncated || pageEndReq < totalUnits,
        nextPageStart: !truncated && pageEndReq < totalUnits ? pageEndReq + 1 : undefined,
        nextCharOffset: nextOff,
        pages: selected.map((x) => ({
          ...x,
          text:
            x.text.length > 4_000 ? `${x.text.slice(0, 4_000)}\n…` : x.text,
        })),
        text: slice,
        charCount: slice.length,
        totalCharCount,
        extractMethod,
        ocrUsed,
        warningAr: warnParts.length ? warnParts.join(' ') : undefined,
        messageAr: truncated
          ? `قُرئ «${filename}» (إزاحة ${charOffset} · ${slice.length} حرفاً). استدعِ مجدداً بـ charOffset=${nextOff}.`
          : `قُرئ «${filename}» بالكامل ضمن النافذة (${selected.length} وحدة).`,
      }
    }
    if (used + block.length > maxChars && parts.length) break
    parts.push(block)
    used += block.length + 2
    lastIncluded = p.index
  }

  const text = parts.join('\n\n')
  const morePages = lastIncluded < pageEndReq || pageEndReq < totalUnits
  const truncated = morePages || text.length >= maxChars
  const brokenAny = selected.some((x) => x.quality === 'broken-tounicode')
  const emptyStill = selected.some(
    (x) => !x.text?.trim() && (x.quality === 'empty' || x.quality === 'ocr')
  )
  const warnParts = [
    scannedWarning,
    brokenAny
      ? 'طبقة ToUnicode قد تكون معطوبة في بعض الصفحات — لا تعتمد النص دون OCR أو Drive.'
      : undefined,
    emptyStill && enableOcr
      ? 'بعض الصفحات بلا نص بعد OCR — تحقق من وضوح المسح أو شغّل جسر الماك (Tesseract ara+eng).'
      : undefined,
  ].filter(Boolean)

  return {
    ok: true,
    kind,
    totalUnits,
    returnedUnits: parts.length || selected.length,
    pageStart,
    pageEnd: lastIncluded || pageEndReq,
    charOffset,
    maxChars,
    truncated,
    hasMore: morePages,
    nextPageStart: morePages ? lastIncluded + 1 : undefined,
    pages: selected
      .filter((p) => p.index >= pageStart && p.index <= (lastIncluded || pageEndReq))
      .map((x) => ({
        ...x,
        text: x.text.length > 4_000 ? `${x.text.slice(0, 4_000)}\n…` : x.text,
      })),
    text,
    charCount: text.length,
    totalCharCount,
    extractMethod,
    ocrUsed,
    warningAr: warnParts.length ? warnParts.join(' ') : undefined,
    messageAr: morePages
      ? `قُرئ «${filename}» صفحات/وحدات ${pageStart}–${lastIncluded} من ${totalUnits}${ocrUsed ? ' (مع OCR)' : ''}. استدعِ read_document بـ pageStart=${lastIncluded + 1} للمتابعة — لا تتخطَّ.`
      : `قُرئ «${filename}» كاملاً (${totalUnits} وحدة · ${totalCharCount} حرفاً)${ocrUsed ? ' عبر OCR' : ''}.`,
  }
}
