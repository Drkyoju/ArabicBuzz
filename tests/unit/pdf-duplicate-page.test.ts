import { describe, expect, it } from 'vitest'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import {
  duplicatePdfPageAfter,
  insertBlankPdfPage,
} from '@/lib/documents/pdf'

async function makeSrc() {
  const src = await PDFDocument.create()
  const font = await src.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < 50; i++) {
    const page = src.addPage([600 + (i === 47 ? 100 : 0), 800])
    page.drawText(`PAGE-${i + 1}`, {
      x: 50,
      y: 700,
      size: 24,
      font,
      color: rgb(0, 0, 0),
    })
  }
  return Buffer.from(await src.save())
}

describe('duplicatePdfPageAfter', () => {
  it('clones page 48 content after page 45', async () => {
    const bytes = await makeSrc()
    const out = await duplicatePdfPageAfter({
      pdf: bytes,
      copyPage: 48,
      afterPage: 45,
    })
    expect(out.pageCountBefore).toBe(50)
    expect(out.pageCountAfter).toBe(51)
    const doc = await PDFDocument.load(out.buffer)
    // Index 45 = duplicate of old page 48 (wider)
    expect(doc.getPage(45).getWidth()).toBe(700)
    // Index 46 = old page 46
    expect(doc.getPage(46).getWidth()).toBe(600)
    // Original page 48 shifted to index 48
    expect(doc.getPage(48).getWidth()).toBe(700)
  })
})

describe('insertBlankPdfPage', () => {
  it('inserts blank matching sizeFromPage', async () => {
    const bytes = await makeSrc()
    const out = await insertBlankPdfPage({
      pdf: bytes,
      afterPage: 45,
      sizeFromPage: 48,
    })
    expect(out.pageCountAfter).toBe(51)
    const doc = await PDFDocument.load(out.buffer)
    expect(doc.getPage(45).getWidth()).toBe(700)
  })
})

describe('findEmptyContentPage', () => {
  it('picks a text-empty page when others have writing', async () => {
    const src = await PDFDocument.create()
    const font = await src.embedFont(StandardFonts.Helvetica)
    for (let i = 0; i < 10; i++) {
      const page = src.addPage([400, 600])
      if (i !== 6) {
        page.drawText(`PAGE-${i + 1}`, {
          x: 40,
          y: 500,
          size: 20,
          font,
          color: rgb(0, 0, 0),
        })
      }
    }
    const bytes = Buffer.from(await src.save())
    const { findEmptyContentPage } = await import('@/lib/documents/pdf')
    const found = await findEmptyContentPage({ pdf: bytes, searchFromPage: 2 })
    expect(found).toBe(7)
  })

  it('never treats basmala / short header as empty', async () => {
    const src = await PDFDocument.create()
    const font = await src.embedFont(StandardFonts.Helvetica)
    // Page 1: content
    {
      const page = src.addPage([400, 600])
      page.drawText('Chapter body with lots of words on this page', {
        x: 40,
        y: 500,
        size: 14,
        font,
        color: rgb(0, 0, 0),
      })
    }
    // Page 2: «بسم الله» style short writing — MUST NOT count as empty
    {
      const page = src.addPage([400, 600])
      page.drawText('Bismillah short title', {
        x: 40,
        y: 500,
        size: 18,
        font,
        color: rgb(0, 0, 0),
      })
    }
    // Pages 3–5: more content
    for (let i = 0; i < 3; i++) {
      const page = src.addPage([400, 600])
      page.drawText(`More body text page ${i + 3} with writing`, {
        x: 40,
        y: 500,
        size: 14,
        font,
        color: rgb(0, 0, 0),
      })
    }
    // Page 6: truly empty (no text)
    src.addPage([400, 600])
    const bytes = Buffer.from(await src.save())
    const { findEmptyContentPage, pdfPageHasWriting } = await import(
      '@/lib/documents/pdf'
    )
    expect(pdfPageHasWriting('بسم الله الرحمن الرحيم')).toBe(true)
    expect(pdfPageHasWriting('   ')).toBe(false)
    const found = await findEmptyContentPage({ pdf: bytes, searchFromPage: 1 })
    expect(found).toBe(6)
    expect(found).not.toBe(2)
  })

  it('returns null when every page has writing', async () => {
    const src = await PDFDocument.create()
    const font = await src.embedFont(StandardFonts.Helvetica)
    for (let i = 0; i < 5; i++) {
      const page = src.addPage([400, 600])
      page.drawText(i === 1 ? 'Bismillah' : `PAGE-${i + 1}`, {
        x: 40,
        y: 500,
        size: 16,
        font,
        color: rgb(0, 0, 0),
      })
    }
    const bytes = Buffer.from(await src.save())
    const { findEmptyContentPage } = await import('@/lib/documents/pdf')
    const found = await findEmptyContentPage({ pdf: bytes })
    expect(found).toBeNull()
  })
})
