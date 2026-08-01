import { NextRequest, NextResponse } from 'next/server'
import { resolveApproval } from '@/lib/agents/resolve-approval'

export const dynamic = 'force-dynamic'
import {
  ARABIC_AUTHZ_ERROR,
  AuthorizationError,
} from '@/lib/auth/rbac'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { approvalId, decision, modifiedParams } = body as {
      approvalId: string
      decision: 'APPROVE' | 'REJECT'
      modifiedParams?: Record<string, unknown>
    }
    const userId = String(body.userId || req.headers.get('x-user-id') || '')
    const orgId = String(body.orgId || req.headers.get('x-org-id') || '')

    if (!approvalId || !decision) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const result = await resolveApproval({
      approvalId,
      decision,
      modifiedParams,
      approvedBy: userId || undefined,
      userId: userId || undefined,
      orgId: orgId || undefined,
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
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (msg === 'ALREADY_RESOLVED') {
      return NextResponse.json({ error: 'Conflict' }, { status: 409 })
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
