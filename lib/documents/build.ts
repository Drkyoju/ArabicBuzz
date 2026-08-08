/**
 * Build Office / text binaries from structured AI output.
 * Round-trips: extract → model revises → rebuild → download.
 */

export type DocFormat = 'docx' | 'xlsx' | 'pptx' | 'txt' | 'md' | 'csv' | 'pdf'

export type SheetSpec = {
  name?: string
  rows: Array<Array<string | number | boolean | null | undefined>>
}

export type SlideSpec = {
  title: string
  bullets?: string[]
  notes?: string
}

export type BuildParagraph = {
  text: string
  heading?: 1 | 2
}

export type BuildDocumentInput = {
  format: DocFormat
  title?: string
  /** Word / text body — paragraphs or markdown-ish lines. */
  body?: string
  paragraphs?: string[] | BuildParagraph[]
  /** Optional Word tables (from Excel sheets). */
  tables?: Array<{ title?: string; rows: string[][] }>
  sheets?: SheetSpec[]
  slides?: SlideSpec[]
}

const MIME: Record<DocFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
}

export function mimeForFormat(format: DocFormat): string {
  return MIME[format]
}

export function extensionForFormat(format: DocFormat): string {
  return `.${format}`
}

function normalizeParagraphs(
  body?: string,
  paragraphs?: string[] | BuildParagraph[]
): BuildParagraph[] {
  if (paragraphs?.length) {
    return paragraphs
      .map((p) =>
        typeof p === 'string'
          ? { text: String(p || '').trim() }
          : { text: String(p.text || '').trim(), heading: p.heading }
      )
      .filter((p) => p.text)
  }
  const raw = String(body || '').replace(/\r\n/g, '\n').trim()
  if (!raw) return [{ text: '' }]
  return raw
    .split(/\n{2,}/)
    .map((p) => ({ text: p.trim() }))
    .filter((p) => p.text)
}

async function buildDocx(input: BuildDocumentInput): Promise<Buffer> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
  } = await import('docx')
  const paras = normalizeParagraphs(input.body, input.paragraphs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [
    ...(input.title
      ? [
          new Paragraph({
            children: [
              new TextRun({
                text: input.title,
                bold: true,
                font: 'Arial',
                size: 32,
                rightToLeft: /[\u0600-\u06FF]/.test(input.title),
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.RIGHT,
            bidirectional: true,
            spacing: { after: 280 },
          }),
        ]
      : []),
    ...paras.map((item) => {
      const text = item.text
      const rtl = /[\u0600-\u06FF]/.test(text)
      const isH1 = item.heading === 1
      const isH2 = item.heading === 2
      return new Paragraph({
        children: [
          new TextRun({
            text,
            font: 'Arial',
            bold: isH1 || isH2,
            size: isH1 ? 28 : isH2 ? 24 : 22,
            rightToLeft: rtl,
          }),
        ],
        heading: isH1
          ? HeadingLevel.HEADING_1
          : isH2
            ? HeadingLevel.HEADING_2
            : undefined,
        alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        bidirectional: rtl,
        spacing: {
          before: isH1 || isH2 ? 240 : 80,
          after: isH1 || isH2 ? 160 : 120,
          line: 276,
        },
      })
    }),
  ]

  for (const table of input.tables || []) {
    if (table.title) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: table.title,
              bold: true,
              font: 'Arial',
              rightToLeft: /[\u0600-\u06FF]/.test(table.title),
            }),
          ],
          alignment: AlignmentType.RIGHT,
          spacing: { before: 240, after: 120 },
        })
      )
    }
    const rows = table.rows || []
    if (!rows.length) continue
    const colCount = Math.max(...rows.map((r) => r.length), 1)
    const thin = {
      style: BorderStyle.SINGLE,
      size: 4,
      color: 'CBD5E1',
    }
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map(
          (row, ri) =>
            new TableRow({
              children: Array.from({ length: colCount }, (_, ci) => {
                const cellText = String(row[ci] ?? '')
                const rtl = /[\u0600-\u06FF]/.test(cellText)
                return new TableCell({
                  borders: { top: thin, bottom: thin, left: thin, right: thin },
                  width: {
                    size: Math.floor(100 / colCount),
                    type: WidthType.PERCENTAGE,
                  },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: cellText || ' ',
                          font: 'Arial',
                          bold: ri === 0,
                          rightToLeft: rtl,
                        }),
                      ],
                      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                      bidirectional: rtl,
                    }),
                  ],
                })
              }),
            })
        ),
      })
    )
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            // RTL page feel for Arabic-heavy docs
            size: {},
          },
        },
        children,
      },
    ],
  })
  const ab = await Packer.toBuffer(doc)
  return Buffer.from(ab)
}

async function buildXlsx(input: BuildDocumentInput): Promise<Buffer> {
  const mod = (await import('exceljs')) as unknown as {
    Workbook?: new () => {
      creator: string
      addWorksheet: (name: string) => {
        addRow: (row: unknown[]) => {
          eachCell: (
            cb: (cell: {
              value: unknown
              alignment?: Record<string, unknown>
            }) => void
          ) => void
        }
        views: unknown
      }
      xlsx: { writeBuffer: () => Promise<ArrayBuffer> }
    }
    default?: {
      Workbook: new () => {
        creator: string
        addWorksheet: (name: string) => {
          addRow: (row: unknown[]) => {
            eachCell: (
              cb: (cell: {
                value: unknown
                alignment?: Record<string, unknown>
              }) => void
            ) => void
          }
          views: unknown
        }
        xlsx: { writeBuffer: () => Promise<ArrayBuffer> }
      }
    }
  }
  const Workbook = mod.Workbook || mod.default?.Workbook
  if (!Workbook) throw new Error('exceljs.Workbook unavailable')
  const wb = new Workbook()
  wb.creator = 'Arabic Buzz'
  const sheets =
    input.sheets && input.sheets.length > 0
      ? input.sheets
      : [
          {
            name: input.title || 'Sheet1',
            rows: splitBody(input.body, input.paragraphs).map((line) =>
              line.includes('\t') ? line.split('\t') : [line]
            ),
          },
        ]
  for (const [i, spec] of sheets.entries()) {
    const ws = wb.addWorksheet(
      (spec.name || `Sheet${i + 1}`).slice(0, 31) || `Sheet${i + 1}`
    )
    for (const row of spec.rows || []) {
      const values = (row || []).map((c) =>
        c === null || c === undefined ? '' : c
      )
      const excelRow = ws.addRow(values)
      excelRow.eachCell((cell) => {
        const v = String(cell.value ?? '')
        if (/[\u0600-\u06FF]/.test(v)) {
          cell.alignment = { horizontal: 'right', readingOrder: 'rtl' }
        }
      })
    }
    ws.views = [{ rightToLeft: true }]
  }
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

async function buildPptx(input: BuildDocumentInput): Promise<Buffer> {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.author = 'Arabic Buzz'
  pptx.title = input.title || 'عرض Arabic Buzz'
  const slides =
    input.slides && input.slides.length > 0
      ? input.slides
      : [
          {
            title: input.title || 'شريحة',
            bullets: splitBody(input.body, input.paragraphs),
          },
        ]
  for (const s of slides) {
    const slide = pptx.addSlide()
    const rtl = /[\u0600-\u06FF]/.test(s.title + (s.bullets || []).join(''))
    slide.addText(s.title || ' ', {
      x: 0.5,
      y: 0.4,
      w: 9,
      h: 1,
      fontSize: 28,
      bold: true,
      fontFace: 'Arial',
      align: rtl ? 'right' : 'left',
      color: '1C1917',
    })
    const bullets = (s.bullets || []).filter(Boolean)
    if (bullets.length) {
      slide.addText(
        bullets.map((b) => ({
          text: b,
          options: { bullet: true, breakLine: true },
        })),
        {
          x: 0.5,
          y: 1.6,
          w: 9,
          h: 3.8,
          fontSize: 18,
          fontFace: 'Arial',
          align: rtl ? 'right' : 'left',
          color: '292524',
          valign: 'top',
        }
      )
    }
    if (s.notes) slide.addNotes(s.notes)
  }
  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  return Buffer.from(out)
}

function buildPlain(input: BuildDocumentInput, format: 'txt' | 'md' | 'csv'): Buffer {
  if (format === 'csv' && input.sheets?.[0]?.rows?.length) {
    const lines = input.sheets[0].rows.map((row) =>
      row
        .map((c) => {
          const s = c === null || c === undefined ? '' : String(c)
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(',')
    )
    return Buffer.from(lines.join('\n'), 'utf8')
  }
  const parts = [
    input.title ? `# ${input.title}` : '',
    ...splitBody(input.body, input.paragraphs),
  ].filter(Boolean)
  return Buffer.from(parts.join('\n\n'), 'utf8')
}

export async function buildDocumentBuffer(
  input: BuildDocumentInput
): Promise<{ buffer: Buffer; mimeType: string; format: DocFormat }> {
  const format = input.format
  let buffer: Buffer
  switch (format) {
    case 'docx':
      buffer = await buildDocx(input)
      break
    case 'xlsx':
      buffer = await buildXlsx(input)
      break
    case 'pptx':
      buffer = await buildPptx(input)
      break
    case 'txt':
    case 'md':
    case 'csv':
      buffer = buildPlain(input, format)
      break
    case 'pdf': {
      const { buildPdfFromText } = await import('@/lib/documents/pdf')
      buffer = await buildPdfFromText({
        title: input.title,
        body: input.body,
        paragraphs: input.paragraphs,
      })
      break
    }
    default:
      throw new Error(`صيغة غير مدعومة: ${String(format)}`)
  }
  return { buffer, mimeType: mimeForFormat(format), format }
}

export function inferFormatFromName(name: string): DocFormat | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx'
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx'
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) return 'pptx'
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.csv')) return 'csv'
  if (lower.endsWith('.md')) return 'md'
  if (lower.endsWith('.txt')) return 'txt'
  return null
}

export function ensureFilename(name: string, format: DocFormat): string {
  const base = (name || `ملف-معدّل`).replace(/[\\/:*?"<>|]+/g, '_').trim()
  const ext = extensionForFormat(format)
  if (base.toLowerCase().endsWith(ext)) return base
  const without = base.replace(/\.(docx?|xlsx?|pptx?|pdf|csv|md|txt)$/i, '')
  return `${without || 'ملف-معدّل'}${ext}`
}
