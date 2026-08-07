import { requireRealUser } from '@/lib/auth/session'
import { executeConvertDocument } from '@/lib/agents/tools/convert-document'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * One-click clean PDF→Word (Drive-first). UI: «حوّل نظيف».
 */
export async function POST(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  let body: {
    scopeId?: string
    fileId?: string
    toFormat?: string
    engine?: string
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'JSON غير صالح' }, { status: 400 })
  }

  const scopeId = String(body.scopeId || 'shared-demo').trim()
  const fileId = String(body.fileId || '').trim()
  if (!fileId) {
    return Response.json({ error: 'مرّر fileId' }, { status: 400 })
  }

  try {
    const { assertRoomCanAccess } = await import('@/lib/rooms/persist')
    const gate = await assertRoomCanAccess(
      scopeId,
      auth.user.id,
      auth.user.email
    )
    if (!gate.ok) {
      return Response.json({ error: gate.error }, { status: 403 })
    }

    const result = await executeConvertDocument('convert_document', {
      scopeId,
      fileId,
      toFormat: body.toFormat || 'docx',
      // Prefer Google Drive clean path when available
      engine: body.engine || 'auto',
      userId: auth.user.id,
      _userId: auth.user.id,
    })

    return Response.json({
      ok: true,
      ...result,
      messageAr:
        (result as { messageAr?: string }).messageAr ||
        'تم التحويل — افتح المرفق من الشات أو الأرشيف.',
    })
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'فشل التحويل',
      },
      { status: 500 }
    )
  }
}
