import { requireSessionUser } from '@/lib/auth/session'
import { extractDocumentText } from '@/lib/rag/extract'
import { readWorkspaceFile, findWorkspaceFile } from '@/lib/documents/workspace'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    m.startsWith('text/') ||
    /\.(txt|md|markdown|json|csv|log)$/i.test(n)
  )
    return 'text'
  return 'other'
}

/**
 * Lightweight preview payload for the side pane (text extract + meta).
 * Binary/image/pdf still load via /api/storage/file in the client.
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
    const hit = await readWorkspaceFile(scopeId, found.id)
    const kind = kindFrom(hit.meta.originalName, hit.meta.mimeType)

    let text: string | null = null
    let truncated = false
    let extractMethod: string | null = null

    if (kind !== 'image') {
      const extracted = await extractDocumentText({
        buffer: hit.buffer,
        filename: hit.meta.originalName,
        mimeType: hit.meta.mimeType,
        enableOcr: kind === 'pdf',
      })
      const full = extracted.text || ''
      const max = 40_000
      truncated = full.length > max
      text = truncated ? `${full.slice(0, max)}\n…` : full
      extractMethod = extracted.method
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
      downloadPath: `/api/storage/file?id=${encodeURIComponent(hit.meta.id)}&scopeId=${encodeURIComponent(scopeId)}`,
      previewMode:
        kind === 'image'
          ? 'image'
          : kind === 'pdf'
            ? 'pdf'
            : text
              ? 'text'
              : 'binary',
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'تعذّرت المعاينة' },
      { status: 500 }
    )
  }
}
