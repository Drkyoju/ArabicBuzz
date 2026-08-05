import { NextRequest, NextResponse } from 'next/server'
import { resolveApproval } from '@/lib/agents/resolve-approval'
import { requireRealUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
import {
  ARABIC_AUTHZ_ERROR,
  AuthorizationError,
} from '@/lib/auth/rbac'

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  try {
    const body = await req.json()
    const { approvalId, decision, modifiedParams } = body as {
      approvalId: string
      decision: 'APPROVE' | 'REJECT'
      modifiedParams?: Record<string, unknown>
    }
    const userId = auth.user.id
    // Client often omits orgId — default so HIGH-risk HITL is not a silent no-op.
    const orgId =
      (typeof body.orgId === 'string' && body.orgId.trim()) ||
      process.env.DEFAULT_ORG_ID ||
      'org-demo'
    const email = auth.user.email ?? null

    if (!approvalId || !decision) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    if (approvalId.length > 128) {
      return NextResponse.json({ error: 'approvalId طويل جداً' }, { status: 400 })
    }
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      return NextResponse.json({ error: 'decision غير صالح' }, { status: 400 })
    }
    if (
      modifiedParams &&
      JSON.stringify(modifiedParams).length > 50_000
    ) {
      return NextResponse.json(
        { error: 'المعاملات المعدّلة كبيرة جداً' },
        { status: 400 }
      )
    }

    const result = await resolveApproval({
      approvalId,
      decision,
      modifiedParams,
      approvedBy: userId,
      userId,
      orgId,
      email,
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status }
      )
    }
    const msg = e instanceof Error ? e.message : 'error'
    if (msg === 'NOT_FOUND') {
      return NextResponse.json(
        {
          error:
            'لم يُعثر على طلب الموافقة (انتهت صلاحيته أو عولج مسبقاً). حدّث الصندوق وحاول مجدداً.',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      )
    }
    if (msg === 'ALREADY_RESOLVED') {
      return NextResponse.json(
        { error: 'تم البت في هذا الطلب مسبقاً.', code: 'ALREADY_RESOLVED' },
        { status: 409 }
      )
    }
    if (msg === 'MISSING_TENANT_CONTEXT') {
      return NextResponse.json(
        { error: ARABIC_AUTHZ_ERROR, code: 'MISSING_TENANT_CONTEXT' },
        { status: 401 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
