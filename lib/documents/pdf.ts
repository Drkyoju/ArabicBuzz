/**
 * PDF create / stamp / merge / form-fill via pdf-lib.
 * Room workspace files — not tied to one Google account.
 */
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib'
import * as fontkit from '@pdf-lib/fontkit'

export type PdfFormField = {
  name: string
  type: string
  value?: string
}

let arabicFontCache: Uint8Array | null = null

async function loadArabicFontBytes(): Promise<Uint8Array | null> {
  if (arabicFontCache) return arabicFontCache
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

/** Best-effort Arabic visual order for pdf-lib (no full bidi engine). */
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
