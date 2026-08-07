import { requireSessionUser, requireRealUser } from '@/lib/auth/session'
import {
  assertRoomCanEdit,
  listCanvasArtifacts,
  listCanvasAudit,
  upsertCanvasArtifact,
} from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const url = new URL(req.url)
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  const { assertRoomCanAccess } = await import('@/lib/rooms/persist')
  const gate = await assertRoomCanAccess(
    scopeId,
    auth.user.id,
    auth.user.email
  )
  if (!gate.ok) {
    return Response.json({ error: gate.error, artifacts: [] }, { status: 403 })
  }
  if (url.searchParams.get('audit') === '1') {
    const audit = await listCanvasAudit(scopeId, 30)
    return Response.json({ audit: audit.rows, ok: audit.ok })
  }
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
      updatedBy: r.updated_by || null,
      updatedAt: r.updated_at || null,
      isEditing: false,
    })
  )
  return Response.json({ artifacts })
}

export async function POST(req: Request) {
  const auth = await requireRealUser(req)
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
  if (String(body.content).length > 200_000) {
    return Response.json({ error: 'المحتوى طويل جداً' }, { status: 400 })
  }
  const scopeId = body.scopeId || 'shared-demo'
  const gate = await assertRoomCanEdit(
    scopeId,
    auth.user.id,
    auth.user.email
  )
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: 403 })
  }
  const result = await upsertCanvasArtifact({
    id: body.id,
    scopeId,
    type: body.type || 'markdown',
    titleAr: body.titleAr || body.id,
    content: body.content,
    language: body.language,
    updatedBy: auth.user.id,
    updatedByAr: String(
      auth.user.user_metadata?.full_name || auth.user.email || auth.user.id
    ),
  })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 })
  }
  try {
    const { logRoomActivity } = await import('@/lib/rooms/home-log')
    await logRoomActivity({
      scopeId,
      kind: 'canvas',
      actorAr: String(
        auth.user.user_metadata?.full_name ||
          auth.user.email?.split('@')[0] ||
          'عضو'
      ),
      actorEmail: auth.user.email || null,
      actionAr: 'عدّل اللوحة',
      detailAr: body.titleAr || body.id,
    })
  } catch {
    /* ignore */
  }
  return Response.json({ ok: true })
}
