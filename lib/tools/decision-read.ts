/**
 * Deep-read association decisions (long/scanned PDF) → Markdown → brain.
 */
import { findWorkspaceFile, readWorkspaceFile } from '@/lib/documents/workspace'
import { extractDocumentText } from '@/lib/rag/extract'
import { parseArabicDocument } from '@/lib/tools/arabic-ocr'
import { ingestArabicDocument } from '@/lib/rag/ingest'

export async function readDecisionDocument(opts: {
  scopeId: string
  fileId?: string
  fileUrl?: string
  contentBase64?: string
  ingestToBrain?: boolean
  titleAr?: string
}) {
  const scopeId = opts.scopeId || 'shared-demo'
  let buffer: Buffer | null = null
  let filename = opts.titleAr || 'قرار.pdf'
  let mime = 'application/pdf'

  if (opts.fileId) {
    const found = await findWorkspaceFile(scopeId, opts.fileId)
    if (!found) throw new Error(`لم يُعثر على الملف «${opts.fileId}»`)
    const hit = await readWorkspaceFile(scopeId, found.id)
    buffer = hit.buffer
    filename = hit.meta.originalName
    mime = hit.meta.mimeType
  } else if (opts.contentBase64) {
    buffer = Buffer.from(opts.contentBase64, 'base64')
  } else if (opts.fileUrl) {
    const res = await fetch(opts.fileUrl, {
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new Error(`تعذّر تنزيل الملف (HTTP ${res.status})`)
    buffer = Buffer.from(await res.arrayBuffer())
    mime = res.headers.get('content-type') || mime
  }

  if (!buffer) throw new Error('مرّر fileId أو fileUrl أو contentBase64')

  // 1) native extract (+ OCR cascade)
  const extracted = await extractDocumentText({
    buffer,
    filename,
    mimeType: mime,
    enableOcr: true,
  })

  let markdown = extracted.text || ''
  let method: string = extracted.method
  let ocrUsed = extracted.ocrUsed

  // 2) If thin text, try arabic-ocr pipeline (Marker/Qari)
  if (markdown.trim().length < 200) {
    try {
      const ocr = await parseArabicDocument(buffer)
      const rich = ocr.markdown || ''
      if (rich.trim().length > markdown.trim().length) {
        markdown = rich
        method = 'arabic_ocr_pipeline'
        ocrUsed = true
      }
    } catch {
      /* keep extract */
    }
  }

  // 3) Optional MarkItDown via Mac bridge
  if (
    markdown.trim().length < 200 &&
    process.env.MAC_SYNC_URL?.trim()
  ) {
    try {
      const base = process.env.MAC_SYNC_URL.replace(/\/$/, '')
      const secret = process.env.MAC_SYNC_SECRET?.trim() || ''
      const res = await fetch(`${base}/markitdown`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({
          filename,
          contentBase64: buffer.toString('base64'),
          mimeType: mime,
        }),
        signal: AbortSignal.timeout(90_000),
      })
      if (res.ok) {
        const data = (await res.json()) as { markdown?: string; text?: string }
        const md = data.markdown || data.text || ''
        if (md.trim().length > markdown.trim().length) {
          markdown = md
          method = 'markitdown_mac'
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (!markdown.trim()) {
    return {
      ok: false,
      messageAr: 'تعذّر استخراج نص من القرار — الملف قد يكون صورة دون OCR ناجح.',
      method,
      ocrUsed,
    }
  }

  let brainChunks = 0
  if (opts.ingestToBrain !== false) {
    const titleAr = opts.titleAr || filename.replace(/\.[^.]+$/, '') || 'قرار'
    const ingested = await ingestArabicDocument({
      scopeId,
      titleAr: `قرار · ${titleAr}`,
      content: markdown,
      sourcePath: filename,
    })
    brainChunks = ingested.chunks
  }

  return {
    ok: true,
    method,
    ocrUsed,
    charCount: markdown.length,
    preview: markdown.slice(0, 2500),
    markdown:
      markdown.length > 24_000
        ? `${markdown.slice(0, 24_000)}\n…`
        : markdown,
    brainChunks,
    messageAr:
      brainChunks > 0
        ? `قُرئ القرار (${method}) وأُضيف ${brainChunks} مقطعاً للمعرفة.`
        : `قُرئ القرار (${method}) — ${markdown.length} حرفاً.`,
  }
}
