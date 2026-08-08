import { describe, expect, it } from 'vitest'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import {
  burnPdfAnnotations,
  normalizeRectAnno,
  mergeNearbyTextHighlights,
  parseHexColor,
  type PdfAnnotation,
} from '@/lib/documents/pdf-annotate'

async function blankPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 600])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('Hello', {
    x: 40,
    y: 540,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.1),
  })
  return doc.save()
}

describe('pdf-annotate burn-in', () => {
  it('parses hex colors', () => {
    expect(parseHexColor('#0e5a46')).toEqual({
      r: expect.closeTo(14 / 255, 5),
      g: expect.closeTo(90 / 255, 5),
      b: expect.closeTo(70 / 255, 5),
    })
  })

  it('burns pen + highlight + rect + text into a larger PDF', async () => {
    const src = await blankPdf()
    const annos: PdfAnnotation[] = [
      {
        id: '1',
        kind: 'pen',
        pageIndex: 0,
        color: '#0e5a46',
        width: 0.01,
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.4, y: 0.25 },
          { x: 0.5, y: 0.3 },
        ],
      },
      {
        id: '2',
        kind: 'highlight',
        pageIndex: 0,
        color: '#f5c542',
        width: 0.02,
        points: [
          { x: 0.1, y: 0.5 },
          { x: 0.6, y: 0.5 },
        ],
        opacity: 0.4,
      },
      {
        id: '3',
        kind: 'rect',
        pageIndex: 0,
        x: 0.2,
        y: 0.6,
        w: 0.3,
        h: 0.1,
        color: '#c45c26',
        fill: true,
      },
      {
        id: '4',
        kind: 'text',
        pageIndex: 0,
        x: 0.15,
        y: 0.75,
        text: 'Note',
        fontSize: 0.03,
        color: '#111111',
      },
      {
        id: '5',
        kind: 'textHighlight',
        pageIndex: 0,
        x: 0.1,
        y: 0.2,
        w: 0.5,
        h: 0.04,
        color: '#f5c542',
        opacity: 0.35,
      },
      {
        id: '6',
        kind: 'sticky',
        pageIndex: 0,
        x: 0.6,
        y: 0.15,
        w: 0.25,
        h: 0.12,
        text: 'ملاحظة',
        color: '#f5e6a3',
        fontSize: 0.02,
      },
    ]
    const out = await burnPdfAnnotations(src, annos)
    expect(out.byteLength).toBeGreaterThan(src.byteLength)
    const reloaded = await PDFDocument.load(out)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('skips annotations on missing pages', async () => {
    const src = await blankPdf()
    const out = await burnPdfAnnotations(src, [
      {
        id: 'x',
        kind: 'pen',
        pageIndex: 9,
        color: '#000000',
        width: 0.01,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    ])
    expect(out.byteLength).toBeGreaterThan(100)
  })

  it('normalizes negative rect dimensions', () => {
    const n = normalizeRectAnno({
      x: 0.5,
      y: 0.5,
      w: -0.2,
      h: -0.1,
    })
    expect(n.x).toBeCloseTo(0.3)
    expect(n.y).toBeCloseTo(0.4)
    expect(n.w).toBeCloseTo(0.2)
    expect(n.h).toBeCloseTo(0.1)
  })

  it('merges nearby text highlights on the same line', () => {
    const list: PdfAnnotation[] = [
      {
        id: 'a',
        kind: 'textHighlight',
        pageIndex: 0,
        x: 0.1,
        y: 0.2,
        w: 0.1,
        h: 0.03,
        color: '#f5c542',
      },
      {
        id: 'b',
        kind: 'textHighlight',
        pageIndex: 0,
        x: 0.2,
        y: 0.205,
        w: 0.12,
        h: 0.03,
        color: '#f5c542',
      },
    ]
    const merged = mergeNearbyTextHighlights(list, 0)
    const highs = merged.filter((a) => a.kind === 'textHighlight')
    expect(highs).toHaveLength(1)
    if (highs[0]?.kind === 'textHighlight') {
      expect(highs[0].w).toBeGreaterThan(0.2)
    }
  })
})
