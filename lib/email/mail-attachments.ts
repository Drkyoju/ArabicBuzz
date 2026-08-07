import { extractDocumentText } from '@/lib/rag/extract'

export type MailAttachmentMeta = {
  id: string
  filename: string
  mimeType: string
  size: number
  /** Base64 of raw bytes — kept for re-extract; capped on sync. */
  contentBase64?: string | null
  extractedText?: string
  extractMethod?: string
  extractNoteAr?: string | null
  ocrUsed?: boolean
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeTransfer(headers: string, body: string): Buffer {
  const cte = (headers.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1] || '')
    .toLowerCase()
    .trim()
  if (cte === 'base64') {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64')
  }
  if (cte === 'quoted-printable') {
    const qp = body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, h: string) =>
        String.fromCharCode(parseInt(h, 16))
      )
    return Buffer.from(qp, 'binary')
  }
  return Buffer.from(body, 'binary')
}

function decodeFilename(raw: string): string {
  const star = raw.match(/filename\*=(?:UTF-8''|utf-8'')([^;\r\n]+)/i)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
    } catch {
      return star[1].trim()
    }
  }
  const plain = raw.match(/filename="?([^";\r\n]+)"?/i)
  if (plain?.[1]) return plain[1].trim()
  return 'attachment.bin'
}

function mimeFromHeaders(headers: string, filename: string): string {
  const ct = headers.match(/Content-Type:\s*([^;\r\n]+)/i)?.[1]?.trim()
  if (ct && !/^multipart\//i.test(ct)) return ct.toLowerCase()
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (lower.endsWith('.doc')) return 'application/msword'
  if (lower.endsWith('.xlsx'))
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (lower.endsWith('.pptx'))
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (/\.(png|jpe?g|webp|gif)$/i.test(lower)) return `image/${lower.split('.').pop()}`
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text/plain'
  return 'application/octet-stream'
}

type MimePart = { headers: string; body: string }

function splitMimeParts(raw: string): MimePart[] {
  const boundaryMatch = raw.match(/boundary="?([^";\r\n]+)"?/i)
  if (!boundaryMatch) {
    const [hdrRaw, ...rest] = raw.split(/\r?\n\r?\n/)
    return [{ headers: hdrRaw || '', body: rest.join('\n\n') }]
  }
  const boundary = boundaryMatch[1]
  const chunks = raw.split(new RegExp(`--${escapeReg(boundary)}`))
  const parts: MimePart[] = []
  for (const chunk of chunks) {
    if (!chunk || chunk.startsWith('--')) continue
    const trimmed = chunk.replace(/^\r?\n/, '')
    if (/^multipart\//i.test(trimmed)) {
      parts.push(...splitMimeParts(trimmed))
      continue
    }
    const [hdrRaw, ...rest] = trimmed.split(/\r?\n\r?\n/)
    const headers = hdrRaw || ''
    const body = rest.join('\n\n').replace(/--\s*$/, '').trim()
    if (/boundary=/i.test(headers) && /Content-Type:\s*multipart\//i.test(headers)) {
      parts.push(...splitMimeParts(`${headers}\r\n\r\n${body}`))
      continue
    }
    parts.push({ headers, body })
  }
  return parts
}

/** Extract text/plain + text/html and file attachments from raw MIME. */
export function parseMimeMessage(raw: string): {
  text: string
  html: string
  attachments: Array<{
    filename: string
    mimeType: string
    buffer: Buffer
  }>
} {
  const out = {
    text: '',
    html: '',
    attachments: [] as Array<{ filename: string; mimeType: string; buffer: Buffer }>,
  }
  if (!raw) return out

  const parts = splitMimeParts(raw)
  let attIdx = 0
  for (const part of parts) {
    const { headers, body } = part
    if (!headers && !body) continue
    const isAttach =
      /Content-Disposition:\s*attachment/i.test(headers) ||
      (/Content-Disposition:\s*inline/i.test(headers) &&
        /filename=/i.test(headers)) ||
      (/name=/i.test(headers) &&
        !/Content-Type:\s*text\/(plain|html)/i.test(headers) &&
        !/Content-Type:\s*multipart\//i.test(headers))

    if (/Content-Type:\s*text\/plain/i.test(headers) && !isAttach && !out.text) {
      out.text = decodeTransfer(headers, body).toString('utf8')
      continue
    }
    if (/Content-Type:\s*text\/html/i.test(headers) && !isAttach && !out.html) {
      out.html = decodeTransfer(headers, body).toString('utf8')
      continue
    }
    if (isAttach || (/filename=/i.test(headers) && !/text\/(plain|html)/i.test(headers))) {
      const filename = decodeFilename(headers) || `attachment-${attIdx + 1}.bin`
      const mimeType = mimeFromHeaders(headers, filename)
      const buffer = decodeTransfer(headers, body)
      if (buffer.length > 0 && buffer.length <= 12_000_000) {
        out.attachments.push({ filename, mimeType, buffer })
        attIdx += 1
      }
    }
  }
  return out
}

const MAX_STORE_BYTES = 2_500_000
const MAX_EXTRACT_CHARS = 40_000

export async function extractAttachmentTexts(
  items: Array<{ filename: string; mimeType: string; buffer: Buffer }>
): Promise<MailAttachmentMeta[]> {
  const result: MailAttachmentMeta[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const id = `att_${i}`
    const meta: MailAttachmentMeta = {
      id,
      filename: item.filename,
      mimeType: item.mimeType,
      size: item.buffer.length,
      contentBase64:
        item.buffer.length <= MAX_STORE_BYTES
          ? item.buffer.toString('base64')
          : null,
      extractNoteAr:
        item.buffer.length > MAX_STORE_BYTES
          ? 'الملف كبير — حُفظت البيانات الوصفية فقط دون المحتوى الكامل.'
          : null,
    }
    try {
      const extracted = await extractDocumentText({
        buffer: item.buffer,
        filename: item.filename,
        mimeType: item.mimeType,
        enableOcr: true,
      })
      meta.extractedText = (extracted.text || '').slice(0, MAX_EXTRACT_CHARS)
      meta.extractMethod = extracted.method
      meta.ocrUsed = extracted.ocrUsed
      if (!meta.extractedText?.trim()) {
        meta.extractNoteAr =
          meta.extractNoteAr ||
          (extracted.ocrUsed
            ? 'تعذّر استخراج نص واضح — قد يلزم جسر Mac لـ OCR للماسح الضوئي.'
            : 'لا نص مستخرج من المرفق (قد يكون صورة ممسوحة أو صيغة غير مدعومة على الخادم).')
      }
    } catch (e) {
      meta.extractNoteAr =
        e instanceof Error
          ? `فشل استخراج المرفق: ${e.message}`
          : 'فشل استخراج المرفق.'
    }
    result.push(meta)
  }
  return result
}

export function attachmentsContextText(atts: MailAttachmentMeta[]): string {
  if (!atts.length) return ''
  return atts
    .map((a) => {
      const body = a.extractedText?.trim()
        ? a.extractedText.slice(0, 12_000)
        : a.extractNoteAr || '(بدون نص)'
      return `--- مرفق: ${a.filename} (${a.mimeType}) ---\n${body}`
    })
    .join('\n\n')
}
