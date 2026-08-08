/**
 * PDF annotation model + burn-in via pdf-lib.
 * Coordinates are normalized 0–1 with origin at the **top-left** of the page
 * (canvas / UI space). Burn-in converts to PDF bottom-left.
 */
import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from 'pdf-lib'
import * as fontkit from '@pdf-lib/fontkit'
import { shapeArabicForPdf } from '@/lib/documents/pdf'

export type PdfNormPoint = { x: number; y: number }

export type PdfPenAnno = {
  id: string
  kind: 'pen'
  pageIndex: number
  color: string
  /** Stroke width as fraction of page width (typical 0.002–0.012). */
  width: number
  points: PdfNormPoint[]
  opacity?: number
}

export type PdfHighlightAnno = {
  id: string
  kind: 'highlight'
  pageIndex: number
  color: string
  width: number
  points: PdfNormPoint[]
  opacity?: number
}

/** Semi-transparent rect highlight (text-selection style). */
export type PdfTextHighlightAnno = {
  id: string
  kind: 'textHighlight'
  pageIndex: number
  x: number
  y: number
  w: number
  h: number
  color: string
  opacity?: number
}

export type PdfTextAnno = {
  id: string
  kind: 'text'
  pageIndex: number
  x: number
  y: number
  text: string
  /** Font size as fraction of page height. */
  fontSize: number
  color: string
}

/** Sticky note — yellow callout with body text (burned as filled rect + text). */
export type PdfStickyAnno = {
  id: string
  kind: 'sticky'
  pageIndex: number
  x: number
  y: number
  w: number
  h: number
  text: string
  color: string
  fontSize: number
}

export type PdfRectAnno = {
  id: string
  kind: 'rect'
  pageIndex: number
  x: number
  y: number
  w: number
  h: number
  color: string
  fill?: boolean
  opacity?: number
}

export type PdfAnnotation =
  | PdfPenAnno
  | PdfHighlightAnno
  | PdfTextHighlightAnno
  | PdfTextAnno
  | PdfStickyAnno
  | PdfRectAnno

export type PdfAnnotateTool =
  | 'pan'
  | 'pen'
  | 'highlight'
  | 'textHighlight'
  | 'text'
  | 'sticky'
  | 'rect'
  | 'eraser'

const HEX_RE = /^#?([0-9a-f]{6})$/i

export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const m = HEX_RE.exec(hex.trim())
  if (!m) return { r: 0.12, g: 0.12, b: 0.12 }
  const n = parseInt(m[1], 16)
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  }
}

function toPdfXY(
  page: PDFPage,
  p: PdfNormPoint
): { x: number; y: number } {
  const { width, height } = page.getSize()
  return {
    x: Math.max(0, Math.min(1, p.x)) * width,
    y: (1 - Math.max(0, Math.min(1, p.y))) * height,
  }
}

function drawStroke(
  page: PDFPage,
  anno: PdfPenAnno | PdfHighlightAnno
) {
  if (anno.points.length < 2) return
  const { width: pw } = page.getSize()
  const { r, g, b } = parseHexColor(anno.color)
  const thickness = Math.max(0.5, (anno.width || 0.004) * pw)
  const opacity =
    anno.opacity ?? (anno.kind === 'highlight' ? 0.35 : 0.95)
  const color = rgb(r, g, b)

  for (let i = 1; i < anno.points.length; i++) {
    const a = toPdfXY(page, anno.points[i - 1]!)
    const c = toPdfXY(page, anno.points[i]!)
    page.drawLine({
      start: a,
      end: c,
      thickness,
      color,
      opacity,
    })
  }
}

function drawRect(page: PDFPage, anno: PdfRectAnno) {
  const { width: pw, height: ph } = page.getSize()
  const { r, g, b } = parseHexColor(anno.color)
  const x = Math.max(0, Math.min(1, anno.x)) * pw
  const yTop = Math.max(0, Math.min(1, anno.y)) * ph
  const w = Math.max(0.001, Math.min(1, Math.abs(anno.w))) * pw
  const h = Math.max(0.001, Math.min(1, Math.abs(anno.h))) * ph
  const y = ph - yTop - (anno.h < 0 ? 0 : h)
  const opacity = anno.opacity ?? (anno.fill ? 0.25 : 0.9)
  page.drawRectangle({
    x: anno.w < 0 ? x - w : x,
    y: anno.h < 0 ? y - h : y,
    width: w,
    height: h,
    borderColor: rgb(r, g, b),
    borderWidth: anno.fill ? 0 : Math.max(0.8, pw * 0.002),
    color: anno.fill ? rgb(r, g, b) : undefined,
    opacity: anno.fill ? opacity : undefined,
    borderOpacity: anno.fill ? undefined : opacity,
  })
}

function drawTextAnno(
  page: PDFPage,
  anno: PdfTextAnno,
  font: PDFFont
) {
  const text = String(anno.text || '').trim()
  if (!text) return
  const { width: pw, height: ph } = page.getSize()
  const { r, g, b } = parseHexColor(anno.color)
  const size = Math.max(8, Math.min(72, (anno.fontSize || 0.025) * ph))
  const pos = toPdfXY(page, { x: anno.x, y: anno.y })
  // pdf-lib draws from baseline; nudge down slightly from click point
  const y = Math.max(4, pos.y - size * 0.15)
  try {
    page.drawText(shapeArabicForPdf(text), {
      x: pos.x,
      y,
      size,
      font,
      color: rgb(r, g, b),
      maxWidth: pw - pos.x - 8,
    })
  } catch {
    /* StandardFonts cannot encode Arabic — soft layer still keeps the text. */
  }
}

async function loadArabicFontForDoc(
  doc: PDFDocument,
  fontBytes?: Uint8Array | null
): Promise<PDFFont> {
  doc.registerFontkit(fontkit)
  if (fontBytes && fontBytes.byteLength > 1000) {
    try {
      return await doc.embedFont(fontBytes, { subset: true })
    } catch {
      /* fall through */
    }
  }
  return doc.embedFont(StandardFonts.Helvetica)
}

function drawSticky(
  page: PDFPage,
  anno: PdfStickyAnno,
  font: PDFFont
) {
  const { width: pw, height: ph } = page.getSize()
  const { r, g, b } = parseHexColor(anno.color || '#f5e6a3')
  const x = Math.max(0, Math.min(1, anno.x)) * pw
  const yTop = Math.max(0, Math.min(1, anno.y)) * ph
  const w = Math.max(0.04, Math.min(1, Math.abs(anno.w || 0.22))) * pw
  const h = Math.max(0.04, Math.min(1, Math.abs(anno.h || 0.12))) * ph
  const y = ph - yTop - h
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color: rgb(r, g, b),
    opacity: 0.92,
    borderColor: rgb(0.55, 0.45, 0.1),
    borderWidth: 0.8,
  })
  const text = String(anno.text || '').trim()
  if (!text) return
  const size = Math.max(8, Math.min(28, (anno.fontSize || 0.018) * ph))
  try {
    page.drawText(shapeArabicForPdf(text), {
      x: x + 4,
      y: y + h - size - 4,
      size,
      font,
      color: rgb(0.15, 0.12, 0.05),
      maxWidth: w - 8,
    })
  } catch {
    /* StandardFonts cannot encode Arabic — soft layer still keeps the text. */
  }
}

function drawTextHighlight(page: PDFPage, anno: PdfTextHighlightAnno) {
  const { width: pw, height: ph } = page.getSize()
  const { r, g, b } = parseHexColor(anno.color || '#f5c542')
  const x = Math.max(0, Math.min(1, anno.x)) * pw
  const yTop = Math.max(0, Math.min(1, anno.y)) * ph
  const w = Math.max(0.001, Math.min(1, Math.abs(anno.w))) * pw
  const h = Math.max(0.001, Math.min(1, Math.abs(anno.h))) * ph
  const y = ph - yTop - (anno.h < 0 ? 0 : h)
  page.drawRectangle({
    x: anno.w < 0 ? x - w : x,
    y: anno.h < 0 ? y - h : y,
    width: w,
    height: h,
    color: rgb(r, g, b),
    opacity: anno.opacity ?? 0.35,
  })
}

/** Burn annotations into PDF bytes. Returns a new PDF ArrayBuffer. */
export async function burnPdfAnnotations(
  pdfBytes: ArrayBuffer | Uint8Array,
  annotations: PdfAnnotation[],
  opts?: { arabicFontBytes?: Uint8Array | null }
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const font = await loadArabicFontForDoc(doc, opts?.arabicFontBytes ?? null)
  const pages = doc.getPages()

  for (const anno of annotations) {
    const page = pages[anno.pageIndex]
    if (!page) continue
    if (anno.kind === 'pen' || anno.kind === 'highlight') {
      drawStroke(page, anno)
    } else if (anno.kind === 'textHighlight') {
      drawTextHighlight(page, anno)
    } else if (anno.kind === 'rect') {
      drawRect(page, anno)
    } else if (anno.kind === 'sticky') {
      drawSticky(page, anno, font)
    } else if (anno.kind === 'text') {
      drawTextAnno(page, anno, font)
    }
  }

  return doc.save({ useObjectStreams: false })
}

/** Soft-layer JSON key for browser localStorage (re-editable until burn). */
export function softLayerStorageKey(fileId: string): string {
  return `ab-pdf-soft-layer:v1:${fileId}`
}

export function loadSoftLayer(fileId: string): PdfAnnotation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(softLayerStorageKey(fileId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as { annotations?: PdfAnnotation[] }
    return Array.isArray(parsed.annotations) ? parsed.annotations : []
  } catch {
    return []
  }
}

export function saveSoftLayer(fileId: string, annotations: PdfAnnotation[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      softLayerStorageKey(fileId),
      JSON.stringify({ annotations, savedAt: new Date().toISOString() })
    )
  } catch {
    /* quota / private mode */
  }
}

export function clearSoftLayer(fileId: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(softLayerStorageKey(fileId))
  } catch {
    /* ignore */
  }
}

export function annotationsDirty(list: PdfAnnotation[]): boolean {
  return list.length > 0
}

export function filterPageAnnotations(
  list: PdfAnnotation[],
  pageIndex: number
): PdfAnnotation[] {
  return list.filter((a) => a.pageIndex === pageIndex)
}

export function newAnnoId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
