import { describe, expect, it } from 'vitest'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import {
  burnPdfAnnotations,
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
})
