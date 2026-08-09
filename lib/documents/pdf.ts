/**
 * PDF create / stamp / merge / form-fill via pdf-lib.
 * Room workspace files — not tied to one Google account.
 */
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib'
import * as fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { shapeArabicForPdf } from '@/lib/documents/pdf-arabic-shape'

export { shapeArabicForPdf }

export type PdfFormField = {
  name: string
  type: string
  value?: string
}

let arabicFontCache: Uint8Array | null = null

/** Load Noto Naskh Arabic bytes for pdf-lib burn-in / stamps. */
export async function loadArabicFontBytes(): Promise<Uint8Array | null> {
  if (arabicFontCache) return arabicFontCache

  // Prefer baked-in TTF (CranL / Docker public/fonts) over CDN.
  const cwd = process.cwd()
  const localPaths = [
    path.join(cwd, 'public/fonts/NotoNaskhArabic-Regular.ttf'),
    path.join(cwd, 'assets/fonts/NotoNaskhArabic-Regular.ttf'),
    path.join(cwd, 'fonts/NotoNaskhArabic-Regular.ttf'),
  ]
  for (const filePath of localPaths) {
    try {
      const buf = new Uint8Array(await readFile(filePath))
      if (buf.byteLength > 1000) {
        arabicFontCache = buf
        return buf
      }
    } catch {
      /* try next */
    }
  }

  const urls = [
    'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Regular.ttf',
    'https://cdn.jsdelivr.net/npm/@fontsource/noto-naskh-arabic@5.0.0/files/noto-naskh-arabic-arabic-400-normal.woff',
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.byteLength > 1000) {
        arabicFontCache = buf
        return buf
      }
    } catch {
      /* try next */
    }
  }
  return null
}


export async function buildPdfFromText(opts: {
  title?: string
  body?: string
  paragraphs?: string[]
}): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const fontBytes = await loadArabicFontBytes()
  const font = fontBytes
    ? await doc.embedFont(fontBytes, { subset: true })
    : await doc.embedFont(StandardFonts.Helvetica)

  const paras = [
    ...(opts.title ? [opts.title] : []),
    ...(opts.paragraphs?.length
      ? opts.paragraphs
      : String(opts.body || '')
          .replace(/\r\n/g, '\n')
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)),
  ]
  if (paras.length === 0) paras.push(' ')

  const margin = 48
  const fontSize = 14
  const lineH = fontSize * 1.6
  let page = doc.addPage()
  let { width, height } = page.getSize()
  let y = height - margin
  const maxW = width - margin * 2

  for (const raw of paras) {
    const text = shapeArabicForPdf(raw)
    const words = text.split(/\s+/)
    let line = ''
    const flush = (s: string) => {
      if (!s) return
      if (y < margin + lineH) {
        page = doc.addPage()
        ;({ width, height } = page.getSize())
        y = height - margin
      }
      page.drawText(s, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.12, 0.12, 0.12),
        maxWidth: maxW,
      })
      y -= lineH
    }
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      const tw = font.widthOfTextAtSize(next, fontSize)
      if (tw > maxW && line) {
        flush(line)
        line = w
      } else {
        line = next
      }
    }
    flush(line)
    y -= lineH * 0.4
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}

export async function stampPdf(opts: {
  pdf: Buffer | Uint8Array
  text: string
  pageIndex?: number
  x?: number
  y?: number
  size?: number
}): Promise<Buffer> {
  // Note: pdf-lib has no HarfBuzz — Arabic stamp is best-effort.
  // For replacing existing names/phrases use replacePdfText (PyMuPDF htmlbox).
  const doc = await PDFDocument.load(opts.pdf)
  doc.registerFontkit(fontkit)
  const pages = doc.getPages()
  const page = pages[Math.min(opts.pageIndex ?? 0, pages.length - 1)]
  if (!page) throw new Error('لا صفحات في ملف PDF')
  const fontBytes = await loadArabicFontBytes()
  const font = fontBytes
    ? await doc.embedFont(fontBytes, { subset: true })
    : await doc.embedFont(StandardFonts.Helvetica)
  const { height } = page.getSize()
  const size = opts.size ?? 12
  page.drawText(shapeArabicForPdf(opts.text), {
    x: opts.x ?? 48,
    y: opts.y ?? height - 64,
    size,
    font,
    color: rgb(0.15, 0.35, 0.55),
  })
  return Buffer.from(await doc.save())
}

export async function mergePdfs(buffers: Array<Buffer | Uint8Array>): Promise<Buffer> {
  if (buffers.length === 0) throw new Error('مرّر ملفين PDF على الأقل')
  const out = await PDFDocument.create()
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf)
    const pages = await out.copyPages(src, src.getPageIndices())
    for (const p of pages) out.addPage(p)
  }
  return Buffer.from(await out.save())
}

export async function listPdfFormFields(
  pdf: Buffer | Uint8Array
): Promise<PdfFormField[]> {
  const doc = await PDFDocument.load(pdf)
  const form = doc.getForm()
  return form.getFields().map((f) => {
    const name = f.getName()
    let value: string | undefined
    try {
      // @ts-expect-error optional getters vary by field type
      value = typeof f.getText === 'function' ? String(f.getText() || '') : undefined
    } catch {
      value = undefined
    }
    return {
      name,
      type: f.constructor?.name || 'field',
      value,
    }
  })
}

export async function fillPdfForm(opts: {
  pdf: Buffer | Uint8Array
  fields: Record<string, string | boolean>
  flatten?: boolean
}): Promise<Buffer> {
  const doc = await PDFDocument.load(opts.pdf)
  const form = doc.getForm()
  for (const [name, val] of Object.entries(opts.fields)) {
    try {
      if (typeof val === 'boolean') {
        const box = form.getCheckBox(name)
        if (val) box.check()
        else box.uncheck()
      } else {
        const field = form.getTextField(name)
        field.setText(String(val))
      }
    } catch {
      try {
        const dd = form.getDropdown(name)
        dd.select(String(val))
      } catch {
        /* skip unknown field */
      }
    }
  }
  if (opts.flatten) form.flatten()
  return Buffer.from(await doc.save())
}

export async function rotatePdfPages(opts: {
  pdf: Buffer | Uint8Array
  degreesClockwise?: 90 | 180 | 270
}): Promise<Buffer> {
  const doc = await PDFDocument.load(opts.pdf)
  const rot = degrees(opts.degreesClockwise ?? 90)
  for (const page of doc.getPages()) {
    page.setRotation(rot)
  }
  return Buffer.from(await doc.save())
}

/**
 * Normalize extractable PDF text for emptiness checks.
 */
export function normalizePdfPageText(raw: string): string {
  return String(raw || '')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** بسم الله / basmala — never treat as «صفحة فاضية». */
export function pdfTextLooksLikeBasmala(text: string): boolean {
  const t = normalizePdfPageText(text)
  if (!t) return false
  return /بسم\s*الله|الرحمن\s*الرحيم|bismillah|basmala/iu.test(t)
}

/**
 * True when extractable text contains any writing (incl. headers/basmala).
 */
export function pdfPageHasWriting(text: string): boolean {
  return normalizePdfPageText(text).length > 0
}

/** Top strip + top-left logo are allowed on an empty leaf (like ص49). */
const EMPTY_PAGE_HEADER_TOP_FRAC = 0.12
const EMPTY_PAGE_LOGO_TOP_FRAC = 0.18
const EMPTY_PAGE_LOGO_LEFT_FRAC = 0.32
const EMPTY_PAGE_FOOTER_BOTTOM_FRAC = 0.1

type PdfTextItemPos = {
  str: string
  x: number
  y: number
}

function isHeaderOrLogoZone(
  item: PdfTextItemPos,
  pageWidth: number,
  pageHeight: number
): boolean {
  const headerY = pageHeight * (1 - EMPTY_PAGE_HEADER_TOP_FRAC)
  if (item.y >= headerY) return true
  const logoY = pageHeight * (1 - EMPTY_PAGE_LOGO_TOP_FRAC)
  const logoX = pageWidth * EMPTY_PAGE_LOGO_LEFT_FRAC
  // Top-left logo/stamp (PDF origin bottom-left).
  if (item.y >= logoY && item.x <= logoX) return true
  return false
}

function isFooterZone(item: PdfTextItemPos, pageHeight: number): boolean {
  return item.y <= pageHeight * EMPTY_PAGE_FOOTER_BOTTOM_FRAC
}

/**
 * Split page text into body vs chrome (header/logo/footer).
 * «صفحة فاضية» = body empty; header/logo/top-left OK; basmala never OK.
 */
export function classifyPdfPageTextZones(opts: {
  items: PdfTextItemPos[]
  pageWidth: number
  pageHeight: number
}): {
  fullText: string
  bodyText: string
  chromeText: string
  hasBasmala: boolean
  bodyEmpty: boolean
} {
  const w = Math.max(1, opts.pageWidth)
  const h = Math.max(1, opts.pageHeight)
  const bodyParts: string[] = []
  const chromeParts: string[] = []
  for (const it of opts.items) {
    const s = String(it.str || '')
    if (!s.trim()) continue
    if (isHeaderOrLogoZone(it, w, h) || isFooterZone(it, h)) {
      chromeParts.push(s)
    } else {
      bodyParts.push(s)
    }
  }
  const fullText = normalizePdfPageText(
    opts.items.map((i) => i.str).join(' ')
  )
  const bodyText = normalizePdfPageText(bodyParts.join(' '))
  const chromeText = normalizePdfPageText(chromeParts.join(' '))
  const hasBasmala =
    pdfTextLooksLikeBasmala(fullText) || pdfTextLooksLikeBasmala(chromeText)
  return {
    fullText,
    bodyText,
    chromeText,
    hasBasmala,
    bodyEmpty: bodyText.length === 0 && !hasBasmala,
  }
}

/**
 * Find an existing empty leaf («صفحة فاضية»).
 * Does NOT invent a white blank page.
 *
 * Rules (aligned with ص49-style leaves):
 * - Body text empty ⇒ candidate (header / logo / top-left / footer OK)
 * - بسم الله / basmala anywhere ⇒ never empty (e.g. page 2)
 * - Prefer fully text-empty pages, then body-empty chrome-only pages
 * - Prefer lower drawn-operator count among peers
 * - If none qualify, return null (caller reports honestly — never invent blank)
 *
 * Returns 1-based page number, or null if none found.
 */
export async function findEmptyContentPage(opts: {
  pdf: Buffer | Uint8Array
  /** Skip very early pages (covers); 1-based inclusive start to search. Default 1. */
  searchFromPage?: number
}): Promise<number | null> {
  const bytes =
    opts.pdf instanceof Buffer ? opts.pdf : Buffer.from(opts.pdf)
  const from = Math.max(1, Math.floor(Number(opts.searchFromPage ?? 1)))

  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
      disableWorker: true,
    } as never)
    const doc = await loadingTask.promise
    const n = doc.numPages
    if (n < 1) return null

    type Hint = {
      page: number
      textLen: number
      bodyLen: number
      ops: number
      bodyEmpty: boolean
      hasBasmala: boolean
    }
    const hints: Hint[] = []
    for (let i = from; i <= n; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items: PdfTextItemPos[] = (
        content.items as Array<{ str?: string; transform?: number[] }>
      ).map((it) => ({
        str: it.str || '',
        x: Array.isArray(it.transform) ? Number(it.transform[4]) || 0 : 0,
        y: Array.isArray(it.transform) ? Number(it.transform[5]) || 0 : 0,
      }))
      const zones = classifyPdfPageTextZones({
        items,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      })
      let ops = 0
      try {
        const list = await page.getOperatorList()
        ops = Array.isArray(list?.fnArray) ? list.fnArray.length : 0
      } catch {
        ops = 0
      }
      hints.push({
        page: i,
        textLen: zones.fullText.length,
        bodyLen: zones.bodyText.length,
        ops,
        bodyEmpty: zones.bodyEmpty,
        hasBasmala: zones.hasBasmala,
      })
    }

    const candidates = hints.filter((h) => h.bodyEmpty && !h.hasBasmala)
    if (candidates.length === 0) return null

    // Tier A: zero extractable text. Tier B: body-empty with header/logo chrome.
    const textEmpty = candidates.filter((h) => h.textLen === 0)
    const pool = textEmpty.length > 0 ? textEmpty : candidates
    const byScore = [...pool].sort((a, b) => {
      if (a.textLen !== b.textLen) return a.textLen - b.textLen
      if (a.bodyLen !== b.bodyLen) return a.bodyLen - b.bodyLen
      return a.ops - b.ops
    })
    const best = byScore[0]!

    // Mixed document with some written pages: any body-empty leaf is valid.
    const withBodyWriting = hints.filter((h) => h.bodyLen > 0 && !h.hasBasmala)
    if (withBodyWriting.length > 0 || textEmpty.length > 0) {
      return best.page
    }

    // Fully scanned / no OCR text on any page: require ops outlier.
    if (hints.length < 3) return best.page
    const allByOps = [...hints].sort((a, b) => a.ops - b.ops)
    const median = allByOps[Math.floor(allByOps.length / 2)]!.ops
    if (median > 0 && best.ops <= median * 0.5) {
      return best.page
    }
    const upper = allByOps.slice(Math.floor(allByOps.length / 2))
    const upperMean =
      upper.reduce((s, x) => s + x.ops, 0) / Math.max(1, upper.length)
    if (upperMean > 0 && best.ops <= upperMean * 0.4) {
      return best.page
    }
    if (best.ops > 0 && best.ops <= 40) return best.page
    return null
  } catch {
    // Last resort: single-page footprint sample (cap pages to avoid OOM/timeout).
    // Only used when pdfjs fails — cannot verify text, so stay conservative.
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const n = src.getPageCount()
      if (n < 3) return null
      const maxSample = Math.min(n, 40)
      const step = Math.max(1, Math.ceil((n - from + 1) / maxSample))
      const footprints: { page: number; footprint: number }[] = []
      for (let i = from; i <= n; i += step) {
        const one = await PDFDocument.create()
        const [p] = await one.copyPages(src, [i - 1])
        if (!p) continue
        one.addPage(p)
        footprints.push({
          page: i,
          footprint: (await one.save()).byteLength,
        })
      }
      if (footprints.length < 3) return null
      const sorted = [...footprints].sort((a, b) => a.footprint - b.footprint)
      const median = sorted[Math.floor(sorted.length / 2)]!.footprint
      const smallest = sorted[0]!
      // Very strict footprint gap — still may pick a light title page; prefer null.
      if (
        smallest.footprint > 0 &&
        median > 0 &&
        smallest.footprint <= median * 0.25
      ) {
        return smallest.page
      }
      return null
    } catch {
      return null
    }
  }
}

/**
 * Duplicate a page (full content) and insert the copy after another page.
 * Example: copyPage=48, afterPage=45 → pages …45, [copy of 48], 46, 47, 48…
 * Uses pdf-lib page copy (preserves content/graphics of the source page).
 */
export async function duplicatePdfPageAfter(opts: {
  pdf: Buffer | Uint8Array
  /** 1-based page to clone (e.g. 48). */
  copyPage: number
  /** 1-based: place the clone immediately after this page (e.g. 45). */
  afterPage: number
}): Promise<{ buffer: Buffer; pageCountBefore: number; pageCountAfter: number }> {
  const src = await PDFDocument.load(opts.pdf, { ignoreEncryption: true })
  const n = src.getPageCount()
  if (n < 1) throw new Error('ملف PDF فارغ')
  const copyPage = Math.floor(Number(opts.copyPage))
  const after = Math.floor(Number(opts.afterPage))
  if (!Number.isFinite(copyPage) || copyPage < 1 || copyPage > n) {
    throw new Error(`copyPage يجب أن يكون بين 1 و ${n}`)
  }
  if (!Number.isFinite(after) || after < 1 || after > n) {
    throw new Error(`afterPage يجب أن يكون بين 1 و ${n}`)
  }

  const out = await PDFDocument.create()
  const indices = src.getPageIndices()
  const copied = await out.copyPages(src, indices)
  const [dup] = await out.copyPages(src, [copyPage - 1])
  if (!dup) throw new Error('تعذّر نسخ الصفحة المطلوبة')

  for (let i = 0; i < copied.length; i++) {
    out.addPage(copied[i]!)
    if (i === after - 1) {
      out.addPage(dup)
    }
  }
  const buffer = Buffer.from(await out.save())
  return {
    buffer,
    pageCountBefore: n,
    pageCountAfter: out.getPageCount(),
  }
}

/**
 * @deprecated Prefer duplicatePdfPageAfter for «نسخ صفحة».
 * Insert a blank white page after a 1-based page number (same size as sizeFromPage).
 */
export async function insertBlankPdfPage(opts: {
  pdf: Buffer | Uint8Array
  /** 1-based: blank is placed immediately after this page. */
  afterPage: number
  /** 1-based: copy width/height from this page (e.g. 48). Defaults to afterPage. */
  sizeFromPage?: number
}): Promise<{ buffer: Buffer; pageCountBefore: number; pageCountAfter: number }> {
  const src = await PDFDocument.load(opts.pdf, { ignoreEncryption: true })
  const n = src.getPageCount()
  if (n < 1) throw new Error('ملف PDF فارغ')
  const after = Math.floor(Number(opts.afterPage))
  if (!Number.isFinite(after) || after < 1 || after > n) {
    throw new Error(`afterPage يجب أن يكون بين 1 و ${n} (عدد الصفحات الحالي)`)
  }
  const sizePage = Math.floor(Number(opts.sizeFromPage ?? after))
  if (!Number.isFinite(sizePage) || sizePage < 1 || sizePage > n) {
    throw new Error(`sizeFromPage يجب أن يكون بين 1 و ${n}`)
  }

  const template = src.getPage(sizePage - 1)
  const { width, height } = template.getSize()

  const out = await PDFDocument.create()
  const indices = src.getPageIndices()
  const copied = await out.copyPages(src, indices)
  for (let i = 0; i < copied.length; i++) {
    out.addPage(copied[i]!)
    if (i === after - 1) {
      out.addPage([width, height])
    }
  }
  const buffer = Buffer.from(await out.save())
  return {
    buffer,
    pageCountBefore: n,
    pageCountAfter: out.getPageCount(),
  }
}
