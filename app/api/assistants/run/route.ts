import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import { runAssistant } from '@/lib/assistants/run'
import { getAssistant } from '@/lib/assistants/catalog'
import { parsePosture } from '@/lib/security/posture'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST { assistantId, message, scopeId?, securityPosture? }
 * Runs a one-shot Arabic assistant via the shared agent engine.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  let body: {
    assistantId?: string
    message?: string
    prompt?: string
    scopeId?: string
    securityPosture?: string
    modelSlug?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 })
  }

  const assistantId = String(body.assistantId || '').trim()
  if (!assistantId || !getAssistant(assistantId)) {
    return NextResponse.json(
      { error: 'معرّف المساعد غير معروف' },
      { status: 400 }
    )
  }

  const message = String(body.message || body.prompt || '').trim()
  if (!message) {
    return NextResponse.json(
      { error: 'اكتب النتيجة المطلوبة بالعربية' },
      { status: 400 }
    )
  }

  const scopeId = String(body.scopeId || 'shared-demo').trim() || 'shared-demo'
  const mode = parsePosture(
    body.securityPosture || process.env.DEFAULT_SECURITY_POSTURE
  )

  try {
    const result = await runAssistant({
      assistantId,
      message,
      scopeId,
      requesterId: auth.user.id,
      mode,
      modelSlug: body.modelSlug ? String(body.modelSlug) : undefined,
    })

    if (result.blocked) {
      return NextResponse.json(
        {
          ok: false,
          blocked: result.blocked,
          assistantId: result.assistantId,
          nameAr: result.nameAr,
        },
        { status: 422 }
      )
    }

    return NextResponse.json({
      ok: true,
      ...result,
      hasPendingApprovals: result.pendingApprovalIds.length > 0,
    })
  } catch (e) {
    console.error('[assistants/run]', e)
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : 'تعذّر تشغيل المساعد حالياً',
      },
      { status: 500 }
    )
  }
}
