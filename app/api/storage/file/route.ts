import { requireUser } from '@/lib/auth/session'
import { readLocalFile } from '@/lib/storage/local'
import { readCloudFile } from '@/lib/storage/cloud'

export const dynamic = 'force-dynamic'

/** Stream a file from Mac vault or cloud fallback. */
export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  const id = url.searchParams.get('id') || ''
  if (!id) {
    return Response.json({ error: 'id مطلوب' }, { status: 400 })
  }

  try {
    let hit: { meta: { mimeType: string; originalName: string }; buffer: Buffer } | null =
      null
    try {
      hit = readLocalFile(scopeId, id)
    } catch {
      hit = null
    }
    if (!hit) {
      hit = await readCloudFile(scopeId, id)
    }
    if (!hit) {
      return Response.json(
        { error: 'الملف غير موجود (لا محلياً ولا سحابياً).' },
        { status: 404 }
      )
    }
    return new Response(new Uint8Array(hit.buffer), {
      status: 200,
      headers: {
        'Content-Type': hit.meta.mimeType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(hit.meta.originalName)}`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'تعذّر القراءة' },
      { status: 500 }
    )
  }
}
