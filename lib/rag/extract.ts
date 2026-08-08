import path from 'node:path'
import {
  runArabicOcr,
  shouldRunOcr,
} from '@/lib/rag/ocr'

export type ExtractResult = {
  text: string
  method:
    | 'plain'
    | 'pdf'
    | 'docx'
    | 'pptx'
    | 'xlsx'
    | 'office'
    | 'ocr-qari-local'
    | 'ocr-qari-hf'
    | 'ocr-gemini'
    | 'ocr-tesseract-ara'
    | 'ocr-tesseract-mac'
    | 'empty'
  ocrUsed: boolean
  ocrProvider?: string
}

function cellValueToString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v)
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v !== 'object') return String(v)
  const o = v as Record<string, unknown>
  if (Array.isArray(o.richText)) {
    return (o.richText as Array<{ text?: string }>)
      .map((t) => t?.text || '')
      .join('')
  }
  if ('text' in o && o.text != null) return String(o.text)
  if ('result' in o) return cellValueToString(o.result)
  if ('formula' in o) return cellValueToString(o.result ?? '')
  if ('sharedFormula' in o) return cellValueToString(o.result ?? '')
  if ('error' in o && o.error != null) return String(o.error)
  if ('hyperlink' in o) return String(o.text ?? o.hyperlink ?? '')
  try {
    const json = JSON.stringify(o)
    return json && json !== '{}' ? json : ''
  } catch {
    return ''
  }
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const ExcelJS = await import('exceljs')
  // exceljs CJS/ESM interop: Workbook often lives on `default`
  const WorkbookCtor =
    (ExcelJS as { Workbook?: new () => import('exceljs').Workbook }).Workbook ||
    (ExcelJS as { default?: { Workbook: new () => import('exceljs').Workbook } })
      .default?.Workbook
  if (!WorkbookCtor) throw new Error('exceljs.Workbook unavailable')
  const wb = new WorkbookCtor()
  await wb.xlsx.load(buffer as never)
  const parts: string[] = []
  wb.eachSheet((sheet) => {
    parts.push(`## ${sheet.name}`)
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as unknown[])
        .slice(1)
        .map((v) => cellValueToString(v))
        .filter((s) => s.trim())
      if (vals.length) parts.push(vals.join('\t'))
    })
  })
  return parts.join('\n').trim()
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return (result.value || '').trim()
}

async function extractWithOfficeParser(
  buffer: Buffer,
  filename: string,
  opts?: { ocr?: boolean }
): Promise<string> {
  const mod = await import('officeparser')
  const parseOffice =
    (mod as { parseOffice?: typeof mod.parseOffice }).parseOffice ||
    (mod as { default?: { parseOffice?: typeof mod.parseOffice } }).default
      ?.parseOffice

  if (!parseOffice) throw new Error('officeparser.parseOffice unavailable')

  const ext = path.extname(filename).replace(/^\./, '').toLowerCase()
  const supported = new Set([
    'docx',
    'pptx',
    'ppt',
    'xlsx',
    'xls',
    'pdf',
    'odt',
    'odp',
    'ods',
    'rtf',
    'csv',
    'md',
    'html',
  ])
  const config: Record<string, unknown> = {}
  if (supported.has(ext)) config.fileType = ext === 'ppt' ? 'pptx' : ext
  if (opts?.ocr) {
    config.ocr = true
    config.ocrConfig = {
      language: process.env.TESSERACT_OCR_LANG || 'ara+eng',
    }
  }

  const ast: unknown = await parseOffice(buffer, config)
  if (ast && typeof (ast as { to?: (f: string) => Promise<string> }).to === 'function') {
    return String(await (ast as { to: (f: string) => Promise<string> }).to('text')).trim()
  }
  if (ast && typeof (ast as { toText?: () => string }).toText === 'function') {
    return String((ast as { toText: () => string }).toText()).trim()
  }
  if (typeof ast === 'string') return ast.trim()
  if (ast && typeof ast === 'object') {
    const maybe = ast as {
      value?: unknown
      text?: unknown
      content?: unknown
      data?: unknown
    }
    for (const v of [maybe.value, maybe.text, maybe.content, maybe.data]) {
      if (typeof v === 'string' && v.trim().length > 0) {
        const t = v.trim()
        if (t !== '[object Object]') return t
      }
    }
    throw new Error('تعذّر استخراج نص من المستند (صيغة غير مدعومة)')
  }
  const asString = String(ast ?? '').trim()
  if (!asString || asString === '[object Object]') {
    throw new Error('تعذّر استخراج نص من المستند (صيغة غير مدعومة)')
  }
  return asString
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { parsePdfBuffer } = await import('@/lib/documents/pdf-parse-safe')
  const parsed = await parsePdfBuffer(buffer)
  const raw = parsed?.text
  const text = typeof raw === 'string' ? raw : raw == null ? '' : String(raw)
  const trimmed = text.trim()
  return trimmed === '[object Object]' ? '' : trimmed
}

/**
 * Extract text from uploads (Word, PowerPoint, PDF, images, plain text),
 * with Arabic OCR fallback for scans/images.
 *
 * Free Arabic OCR path people refer to: Qari (NAMAA-Space) on Hugging Face.
 * Cascade: QARI_OCR_URL → HF_TOKEN (Qari) → Gemini → optional Tesseract ara.
 */
export async function extractDocumentText(opts: {
  buffer: Buffer
  filename: string
  mimeType: string
  enableOcr?: boolean
}): Promise<ExtractResult> {
  const filename = opts.filename || 'upload.bin'
  const mime = opts.mimeType || 'application/octet-stream'
  const lower = filename.toLowerCase()
  const enableOcr = opts.enableOcr !== false

  let text = ''
  let method: ExtractResult['method'] = 'empty'

  try {
    if (
      mime.startsWith('text/') ||
      lower.endsWith('.txt') ||
      lower.endsWith('.md') ||
      lower.endsWith('.csv')
    ) {
      text = opts.buffer.toString('utf8').trim()
      method = 'plain'
    } else if (lower.endsWith('.docx') || mime.includes('wordprocessingml')) {
      try {
        text = await extractDocx(opts.buffer)
      } catch {
        text = await extractWithOfficeParser(opts.buffer, filename)
      }
      method = 'docx'
    } else if (
      lower.endsWith('.pptx') ||
      lower.endsWith('.ppt') ||
      mime.includes('presentationml') ||
      mime.includes('ms-powerpoint')
    ) {
      text = await extractWithOfficeParser(opts.buffer, filename)
      method = 'pptx'
    } else if (lower.endsWith('.doc') || mime === 'application/msword') {
      text = await extractWithOfficeParser(opts.buffer, filename)
      method = 'office'
    } else if (lower.endsWith('.pdf') || mime.includes('pdf')) {
      try {
        text = await extractPdf(opts.buffer)
      } catch {
        text = await extractWithOfficeParser(opts.buffer, filename)
      }
      method = 'pdf'
    } else if (
      mime.startsWith('image/') ||
      /\.(png|jpe?g|webp|tif{1,2})$/i.test(lower)
    ) {
      text = ''
      method = 'empty'
    } else if (
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xls') ||
      lower.endsWith('.csv') ||
      mime.includes('spreadsheet') ||
      mime.includes('excel')
    ) {
      if (lower.endsWith('.csv') || mime.includes('csv')) {
        text = opts.buffer.toString('utf8').trim()
        method = 'plain'
      } else {
        try {
          text = await extractXlsx(opts.buffer)
        } catch {
          text = await extractWithOfficeParser(opts.buffer, filename)
        }
        if (!text.trim() || text.trim() === '[object Object]') {
          try {
            text = await extractWithOfficeParser(opts.buffer, filename)
          } catch {
            text = ''
          }
        }
        if (text.trim() === '[object Object]') text = ''
        method = 'xlsx'
      }
    } else {
      text = opts.buffer.toString('utf8').replace(/\0/g, '').trim()
      method = text ? 'plain' : 'empty'
    }
  } catch {
    text = ''
  }

  if (
    enableOcr &&
    shouldRunOcr({
      extractedText: text,
      filename,
      mimeType: mime,
      byteLength: opts.buffer.length,
    })
  ) {
    const ocr = await runArabicOcr({
      buffer: opts.buffer,
      filename,
      mimeType: mime,
    })
    if (ocr.text) {
      const merged =
        text.length > 40 ? `${text}\n\n--- OCR ---\n\n${ocr.text}` : ocr.text
      const ocrMethod =
        ocr.provider === 'tesseract-mac'
          ? 'ocr-tesseract-mac'
          : ocr.provider === 'qari-local'
            ? 'ocr-qari-local'
            : ocr.provider === 'qari-hf'
              ? 'ocr-qari-hf'
              : ocr.provider === 'gemini'
                ? 'ocr-gemini'
                : method
      return {
        text: merged,
        method: ocrMethod,
        ocrUsed: true,
        ocrProvider: ocr.provider,
      }
    }

    // Last resort on Mac/local: officeparser + Tesseract Arabic
    if (process.env.ENABLE_TESSERACT_OCR === 'true') {
      try {
        const tess = await extractWithOfficeParser(opts.buffer, filename, {
          ocr: true,
        })
        if (tess.trim()) {
          return {
            text: tess,
            method: 'ocr-tesseract-ara',
            ocrUsed: true,
            ocrProvider: 'tesseract-ara',
          }
        }
      } catch {
        /* ignore */
      }
    }

    return {
      text,
      method,
      ocrUsed: true,
      ocrProvider: ocr.provider,
    }
  }

  return { text, method, ocrUsed: false }
}
