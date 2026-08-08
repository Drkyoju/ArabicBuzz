import { requireRealUser } from '@/lib/auth/session'
import { executeConvertDocument } from '@/lib/agents/tools/convert-document'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Clean PDF↔Word — Gemini → strong Gemini → Paddle → STOP (Mistral opt-in only).
 * UI: «إلى Word» / «إلى PDF». Never returns a طلاسم file as success.
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
    return Response.json(
      { ok: false, reason_ar: 'JSON غير صالح', error: 'JSON غير صالح' },
      { status: 400 }
    )
  }

  const scopeId = String(body.scopeId || 'shared-demo').trim()
  const fileId = String(body.fileId || '').trim()
  if (!fileId) {
    return Response.json(
      { ok: false, reason_ar: 'مرّر fileId', error: 'مرّر fileId' },
      { status: 400 }
    )
  }

  try {
    const { assertRoomCanAccess } = await import('@/lib/rooms/persist')
    const gate = await assertRoomCanAccess(
      scopeId,
      auth.user.id,
      auth.user.email
    )
    if (!gate.ok) {
      return Response.json(
        { ok: false, reason_ar: gate.error, error: gate.error },
        { status: 403 }
      )
    }

    const result = await executeConvertDocument('convert_document', {
      scopeId,
      fileId,
      toFormat: body.toFormat || 'docx',
      engine: body.engine || 'auto',
      userId: auth.user.id,
      _userId: auth.user.id,
    })

    const r = result as {
      ok?: boolean
      reason_ar?: string
      messageAr?: string
      error?: string
    }

    if (r.ok === false) {
      const reason =
        r.reason_ar || r.messageAr || r.error || 'رُفض التحويل — نص عربي غير نظيف'
      return Response.json(
        {
          ...result,
          ok: false,
          reason_ar: reason,
          messageAr: reason,
          error: reason,
        },
        { status: 422 }
      )
    }

    return Response.json({
      ...result,
      ok: true,
      messageAr:
        r.messageAr || 'تم التحويل — افتح المرفق من الشات أو الأرشيف.',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'فشل التحويل'
    return Response.json(
      {
        ok: false,
        reason_ar: msg,
        error: msg,
        messageAr: msg,
      },
      { status: 500 }
    )
  }
}
