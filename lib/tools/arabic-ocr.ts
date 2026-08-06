/**
 * Arabic document OCR & layout parser.
 *
 * Cascade (Netlify-safe):
 *  1) MARKER_OCR_URL / SURYA_OCR_URL — self-hosted Marker/Surya HTTP bridge
 *  2) Existing Qari / Gemini cascade via lib/rag/ocr.ts
 *
 * GitHub refs: VikParuchuri/surya · VikParuchuri/marker
 */

import { runArabicOcr } from '@/lib/rag/ocr'

export type ParsedDocumentMarkdown = {
  ok: boolean
  markdown: string
  tables: string[]
  provider: 'marker' | 'surya' | 'qari' | 'gemini' | 'none'
  pages?: number
  messageAr: string
  rawText?: string
  error?: string
}

async function fetchBuffer(
  fileUrlOrBuffer: string | Buffer,
  opts?: { mimeType?: string; filename?: string }
): Promise<{ buffer: Buffer; mime: string; filename: string }> {
  if (Buffer.isBuffer(fileUrlOrBuffer)) {
    return {
      buffer: fileUrlOrBuffer,
      mime: opts?.mimeType || 'application/octet-stream',
      filename: opts?.filename || 'document.bin',
    }
  }
  const src = fileUrlOrBuffer.trim()
  if (src.startsWith('data:')) {
    const m = src.match(/^data:([^;]+);base64,(.+)$/)
    if (!m) throw new Error('data URL غير صالح')
    return {
      buffer: Buffer.from(m[2], 'base64'),
      mime: m[1],
      filename: 'inline.bin',
    }
  }
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`تعذّر جلب الملف (HTTP ${res.status})`)
    const mime =
      res.headers.get('content-type')?.split(';')[0] ||
      'application/octet-stream'
    const buf = Buffer.from(await res.arrayBuffer())
    const name =
      src.split('/').pop()?.split('?')[0] ||
      (mime.includes('pdf') ? 'doc.pdf' : 'doc.bin')
    return { buffer: buf, mime, filename: name }
  }
  // Treat as base64
  return {
    buffer: Buffer.from(src, 'base64'),
    mime: 'application/octet-stream',
    filename: 'document.bin',
  }
}

async function viaLayoutBridge(
  kind: 'marker' | 'surya',
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<ParsedDocumentMarkdown | null> {
  const envKey = kind === 'marker' ? 'MARKER_OCR_URL' : 'SURYA_OCR_URL'
  const base = (process.env[envKey] || '').replace(/\/$/, '')
  if (!base) return null
  const secret =
    process.env.MARKER_OCR_SECRET?.trim() ||
    process.env.SURYA_OCR_SECRET?.trim() ||
    process.env.QARI_OCR_SECRET?.trim() ||
    ''
  try {
    const res = await fetch(`${base}/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        filename,
        mimeType: mime,
        contentBase64: buffer.toString('base64'),
        rtl: true,
        output: 'markdown',
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      return {
        ok: false,
        markdown: '',
        tables: [],
        provider: kind,
        messageAr: `فشل ${kind} (HTTP ${res.status})`,
        error: `HTTP ${res.status}`,
      }
    }
    const data = (await res.json()) as {
      markdown?: string
      text?: string
      tables?: string[]
      pages?: number
      error?: string
    }
    const markdown = (data.markdown || data.text || '').trim()
    const tables = Array.isArray(data.tables)
      ? data.tables.map(String)
      : extractMarkdownTables(markdown)
    return {
      ok: Boolean(markdown),
      markdown,
      tables,
      provider: kind,
      pages: data.pages,
      messageAr: markdown
        ? `تم تحليل المستند عبر ${kind === 'marker' ? 'Marker' : 'Surya'}.`
        : data.error || 'لم يُستخرج نص.',
      rawText: markdown,
      error: data.error,
    }
  } catch (e) {
    return {
      ok: false,
      markdown: '',
      tables: [],
      provider: kind,
      messageAr: `تعذّر الاتصال بـ ${kind}.`,
      error: e instanceof Error ? e.message : 'error',
    }
  }
}

function extractMarkdownTables(md: string): string[] {
  const blocks: string[] = []
  const lines = md.split('\n')
  let buf: string[] = []
  for (const line of lines) {
    if (/^\s*\|/.test(line)) {
      buf.push(line)
    } else if (buf.length) {
      blocks.push(buf.join('\n'))
      buf = []
    }
  }
  if (buf.length) blocks.push(buf.join('\n'))
  return blocks
}

/** Convert plain OCR text into light Markdown with RTL-friendly paragraphs. */
function textToMarkdown(text: string): string {
  const cleaned = text.replace(/\r\n/g, '\n').trim()
  if (!cleaned) return ''
  // Keep pipe tables if OCR already produced them
  if (cleaned.includes('|') && cleaned.includes('\n')) {
    return cleaned
  }
  return cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Parse a scanned Arabic PDF / ID / voucher into structured Markdown.
 */
export async function parseArabicDocument(
  fileUrlOrBuffer: string | Buffer,
  opts?: { mimeType?: string; filename?: string }
): Promise<ParsedDocumentMarkdown> {
  let buffer: Buffer
  let mime: string
  let filename: string
  try {
    ;({ buffer, mime, filename } = await fetchBuffer(fileUrlOrBuffer, opts))
  } catch (e) {
    return {
      ok: false,
      markdown: '',
      tables: [],
      provider: 'none',
      messageAr: e instanceof Error ? e.message : 'تعذّر قراءة الملف',
      error: e instanceof Error ? e.message : 'error',
    }
  }

  const marker = await viaLayoutBridge('marker', buffer, mime, filename)
  if (marker?.ok && marker.markdown) return marker

  const surya = await viaLayoutBridge('surya', buffer, mime, filename)
  if (surya?.ok && surya.markdown) return surya

  const ocr = await runArabicOcr({ buffer, filename, mimeType: mime })
  const markdown = textToMarkdown(ocr.text)
  const provider =
    ocr.provider === 'gemini'
      ? 'gemini'
      : ocr.provider === 'none'
        ? 'none'
        : 'qari'

  return {
    ok: Boolean(markdown),
    markdown,
    tables: extractMarkdownTables(markdown),
    provider,
    messageAr: markdown
      ? 'تم استخراج النص العربي (OCR) وتحويله إلى Markdown.'
      : ocr.error ||
        'تعذّر التحليل. اضبط MARKER_OCR_URL أو SURYA_OCR_URL أو مسار Qari/Gemini.',
    rawText: ocr.text,
    error: ocr.error,
  }
}
