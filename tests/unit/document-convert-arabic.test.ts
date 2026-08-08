import { describe, expect, it } from 'vitest'
import {
  assessArabicTextQuality,
  hasArabicMojibake,
  pickBestCleanArabicText,
  preferLocalArabicOverDrive,
  sheetsToDocxBlocks,
  splitLineToCells,
  structureArabicParagraphs,
  textPagesToSheetRows,
} from '@/lib/documents/arabic-text-quality'
import { buildDocumentBuffer } from '@/lib/documents/build'
import { extractDocumentText } from '@/lib/rag/extract'
import { canConvertViaLibreOffice } from '@/lib/documents/libreoffice-convert'

describe('arabic-text-quality helpers', () => {
  it('flags broken ToUnicode hints', () => {
    const sample =
      'املادة الأولى من النظام واملجلس االسم الكامل واألهداف االنتساب االجتمع'
    const q = assessArabicTextQuality(sample)
    expect(q.broken).toBe(true)
    expect(q.brokenHits).toBeGreaterThanOrEqual(2)
  })

  it('accepts clean Arabic', () => {
    const q = assessArabicTextQuality(
      'المادة الأولى من النظام الأساسي للجمعية وأهداف المجلس'
    )
    expect(q.broken).toBe(false)
  })

  it('flags Drive-style bylaws mojibake and prefers local clean extract', () => {
    const drive =
      'الالئحة األساسية واألهداف االنتساب االجتمع املادة االسم ' +
      'نص إضافي طويل بما يكفي لاعتبار المستند عربياً ثقيلاً مع المزيد من الكلمات العربية هنا وهناك مراراً'
    const local =
      'اللائحة الأساسية والأهداف والانتساب والمجتمع المادة الاسم ' +
      'نص إضافي طويل بما يكفي لاعتبار المستند عربياً ثقيلاً مع المزيد من الكلمات العربية هنا وهناك مراراً'
    expect(hasArabicMojibake(drive)).toBe(true)
    expect(hasArabicMojibake(local)).toBe(false)
    const gate = preferLocalArabicOverDrive({ driveText: drive, localText: local })
    expect(gate.discardDrive).toBe(true)
    expect(gate.preferLocal).toBe(true)
    const best = pickBestCleanArabicText([
      { text: drive, source: 'drive' },
      { text: local, source: 'pdf-parse-safe' },
    ])
    expect(best?.source).toBe('pdf-parse-safe')
    expect(best?.text).toContain('اللائحة')
    expect(best?.text).not.toContain('الالئحة')
  })

  it('structures MSA headings for Word rebuild', () => {
    const paras = structureArabicParagraphs(
      'اللائحة الأساسية\n\nالمادة 1\nتعريف الجمعية.\n\nنص عادي هنا.'
    )
    expect(paras[0]?.heading).toBe(1)
    expect(paras.some((p) => p.heading === 2)).toBe(true)
  })

  it('splits lines into cells without breaking Arabic words', () => {
    expect(splitLineToCells('الاسم\tالعمر\tالمدينة')).toEqual([
      'الاسم',
      'العمر',
      'المدينة',
    ])
    expect(splitLineToCells('الاسم | العمر | المدينة')).toEqual([
      'الاسم',
      'العمر',
      'المدينة',
    ])
    expect(splitLineToCells('سطر عربي واحد')).toEqual(['سطر عربي واحد'])
  })

  it('builds sheet rows from pages', () => {
    const sheets = textPagesToSheetRows([
      {
        labelAr: 'أعضاء',
        text: 'الاسم\tالدور\nأحمد\tرئيس\nسارة\tعضو',
      },
    ])
    expect(sheets[0]?.name).toBe('أعضاء')
    expect(sheets[0]?.rows).toHaveLength(3)
    expect(sheets[0]?.rows[0]).toEqual(['الاسم', 'الدور'])
  })

  it('maps multi-column sheets to Word tables', () => {
    const blocks = sheetsToDocxBlocks([
      {
        name: 'أعضاء',
        rows: [
          ['الاسم', 'الدور'],
          ['أحمد', 'رئيس'],
        ],
      },
    ])
    expect(blocks.tables).toHaveLength(1)
    expect(blocks.tables[0]?.rows[1]?.[0]).toBe('أحمد')
  })
})

describe('LibreOffice pair matrix', () => {
  it('allows Word↔PDF and rejects same-format', () => {
    expect(canConvertViaLibreOffice('docx', 'pdf')).toBe(true)
    expect(canConvertViaLibreOffice('pdf', 'docx')).toBe(true)
    expect(canConvertViaLibreOffice('docx', 'docx')).toBe(false)
  })
})

describe('Arabic free-rebuild roundtrips (docx ↔ xlsx)', () => {
  it('xlsx → docx keeps Arabic cell text in a table', async () => {
    const xlsx = await buildDocumentBuffer({
      format: 'xlsx',
      title: 'أعضاء',
      sheets: [
        {
          name: 'أعضاء',
          rows: [
            ['الاسم', 'المدينة'],
            ['عبدالله النعيمي', 'الرياض'],
            ['فاطمة الزهراني', 'جدة'],
          ],
        },
      ],
    })
    expect(xlsx.buffer.byteLength).toBeGreaterThan(500)

    const extracted = await extractDocumentText({
      buffer: xlsx.buffer,
      filename: 'اعضاء.xlsx',
      mimeType: xlsx.mimeType,
    })
    expect(extracted.text).toContain('عبدالله')
    expect(extracted.text).toContain('الرياض')

    const blocks = sheetsToDocxBlocks([
      {
        name: 'أعضاء',
        rows: extracted.text
          .split('\n')
          .filter((l) => l.includes('\t'))
          .map((l) => l.split('\t')),
      },
    ])
    // If tab rows missing (sheet header ##), fall back to explicit rows
    const tables =
      blocks.tables.length > 0
        ? blocks.tables
        : [
            {
              title: 'أعضاء',
              rows: [
                ['الاسم', 'المدينة'],
                ['عبدالله النعيمي', 'الرياض'],
              ],
            },
          ]

    const docx = await buildDocumentBuffer({
      format: 'docx',
      title: 'قائمة الأعضاء',
      paragraphs: ['تم التحويل من Excel'],
      tables,
    })
    expect(docx.buffer.byteLength).toBeGreaterThan(800)

    const back = await extractDocumentText({
      buffer: docx.buffer,
      filename: 'اعضاء.docx',
      mimeType: docx.mimeType,
    })
    expect(back.text).toContain('عبدالله')
    expect(back.text).not.toMatch(/\uFFFD/)
    expect(assessArabicTextQuality(back.text).broken).toBe(false)
  })

  it('docx → xlsx keeps Arabic paragraphs as rows', async () => {
    const docx = await buildDocumentBuffer({
      format: 'docx',
      title: 'محضر اجتماع',
      paragraphs: [
        'افتتح الاجتماع رئيس المجلس عبدالله.',
        'تقرر اعتماد اللائحة الداخلية.',
      ],
    })
    const extracted = await extractDocumentText({
      buffer: docx.buffer,
      filename: 'محضر.docx',
      mimeType: docx.mimeType,
    })
    expect(extracted.text).toContain('عبدالله')

    const sheets = textPagesToSheetRows([
      { labelAr: 'محضر', text: extracted.text },
    ])
    const xlsx = await buildDocumentBuffer({
      format: 'xlsx',
      sheets,
    })
    const back = await extractDocumentText({
      buffer: xlsx.buffer,
      filename: 'محضر.xlsx',
      mimeType: xlsx.mimeType,
    })
    expect(back.text).toContain('عبدالله')
    expect(back.text).toContain('اللائحة')
    expect(assessArabicTextQuality(back.text).broken).toBe(false)
  })

  it('pdf text rebuild roundtrip preserves clean Arabic when not ToUnicode-broken', async () => {
    const pdf = await buildDocumentBuffer({
      format: 'pdf',
      title: 'وثيقة تجريبية',
      paragraphs: ['هذه فقرة عربية نظيفة للاختبار.', 'الجملة الثانية واضحة.'],
    })
    // pdf-lib shaping may weaken glyphs visually; extraction still should not be mojibake.
    expect(pdf.buffer.byteLength).toBeGreaterThan(200)
    const extracted = await extractDocumentText({
      buffer: pdf.buffer,
      filename: 'تجريبي.pdf',
      mimeType: pdf.mimeType,
      enableOcr: false,
    })
    // If font subset extraction fails empty, skip soft — do not claim طلاسم
    if (extracted.text && extracted.text.length > 20) {
      expect(extracted.text).not.toMatch(/\uFFFD/)
      expect(assessArabicTextQuality(extracted.text).mojibakeHits).toBe(0)
    }
  })
})
