import { requireSessionUser } from '@/lib/auth/session'
import { extractDocumentText } from '@/lib/rag/extract'
import { readWorkspaceFile, findWorkspaceFile } from '@/lib/documents/workspace'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function kindFrom(name: string, mime: string): string {
  const n = name.toLowerCase()
  const m = mime.toLowerCase()
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|tiff?)$/i.test(n))
    return 'image'
  if (m.includes('pdf') || n.endsWith('.pdf')) return 'pdf'
  if (
    m.includes('sheet') ||
    m.includes('excel') ||
    /\.xlsx?$/i.test(n) ||
    n.endsWith('.csv')
  )
    return 'xlsx'
  if (m.includes('presentation') || /\.pptx?$/i.test(n)) return 'pptx'
  if (
    m.includes('word') ||
    m.includes('document') ||
    /\.docx?$/i.test(n)
  )
    return 'docx'
  if (
    m.startsWith('audio/') ||
    /\.(ogg|opus|webm|mp3|m4a|wav|aac)$/i.test(n)
  )
    return 'audio'
  if (
    m.startsWith('text/') ||
    /\.(txt|md|markdown|json|csv|log)$/i.test(n)
  )
    return 'text'
  return 'other'
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('انتهت مهلة استخراج النص')),
          ms
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Lightweight preview payload for the side pane.
 * Image/PDF: metadata only — binary loads via /api/storage/file (no OCR).
 * Text-like: short extract without OCR so Netlify never 502s the pane.
 */
export async function GET(req: Request) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  const id = url.searchParams.get('id') || ''
  if (!id) {
    return Response.json({ error: 'id مطلوب' }, { status: 400 })
  }

  try {
    const found = await findWorkspaceFile(scopeId, id)
    if (!found) {
      return Response.json({ error: 'الملف غير موجود' }, { status: 404 })
    }

    const kind = kindFrom(found.originalName, found.mimeType)
    const downloadPath = `/api/storage/file?id=${encodeURIComponent(found.id)}&scopeId=${encodeURIComponent(scopeId)}`

    // Visual / audio modes never need server-side extract/OCR — that was 502'ing Netlify (~40s).
    if (kind === 'image' || kind === 'pdf' || kind === 'audio') {
      return Response.json({
        ok: true,
        fileId: found.id,
        name: found.originalName,
        mimeType: found.mimeType,
        size: found.size ?? 0,
        kind,
        text: null,
        truncated: false,
        extractMethod: null,
        charCount: 0,
        downloadPath,
        previewMode:
          kind === 'image' ? 'image' : kind === 'pdf' ? 'pdf' : 'audio',
      })
    }

    const hit = await readWorkspaceFile(scopeId, found.id)
    let text: string | null = null
    let truncated = false
    let extractMethod: string | null = null

    try {
      const extracted = await withTimeout(
        extractDocumentText({
          buffer: hit.buffer,
          filename: hit.meta.originalName,
          mimeType: hit.meta.mimeType,
          enableOcr: false,
        }),
        12_000
      )
      const full = extracted.text || ''
      const max = 40_000
      truncated = full.length > max
      text = truncated ? `${full.slice(0, max)}\n…` : full
      extractMethod = extracted.method
    } catch {
      text = null
      extractMethod = null
    }

    return Response.json({
      ok: true,
      fileId: hit.meta.id,
      name: hit.meta.originalName,
      mimeType: hit.meta.mimeType,
      size: hit.buffer.length,
      kind,
      text,
      truncated,
      extractMethod,
      charCount: text?.length ?? 0,
      downloadPath,
      previewMode: text ? 'text' : 'binary',
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'تعذّرت المعاينة' },
      { status: 500 }
    )
  }
}
