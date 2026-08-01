import { requireUser } from '@/lib/auth/session'
import {
  listCanvasArtifacts,
  upsertCanvasArtifact,
} from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const scopeId =
    new URL(req.url).searchParams.get('scopeId') || 'shared-demo'
  const result = await listCanvasArtifacts(scopeId)
  if (!result.ok) {
    return Response.json({ artifacts: [], warning: result.error })
  }
  const artifacts = (result.rows as Array<Record<string, string>>).map(
    (r) => ({
      id: r.id,
      type: r.type,
      titleAr: r.title_ar,
      content: r.content,
      language: r.language,
      isEditing: false,
    })
  )
  return Response.json({ artifacts })
}

export async function POST(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json()) as {
    id?: string
    scopeId?: string
    type?: string
    titleAr?: string
    content?: string
    language?: string
  }
  if (!body.id || !body.content) {
    return Response.json({ error: 'id و content مطلوبان' }, { status: 400 })
  }
  const result = await upsertCanvasArtifact({
    id: body.id,
    scopeId: body.scopeId || 'shared-demo',
    type: body.type || 'markdown',
    titleAr: body.titleAr || body.id,
    content: body.content,
    language: body.language,
    updatedBy: auth.user.id,
  })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 })
  }
  return Response.json({ ok: true })
}
