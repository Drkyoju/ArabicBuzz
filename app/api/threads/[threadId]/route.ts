import { NextRequest, NextResponse } from 'next/server'
import { prisma, withPrismaFallback } from '@/lib/db'
import {
  ARABIC_AUTHZ_ERROR,
  assertPermission,
  AuthorizationError,
  SENSITIVE_ACTION_ROLES,
  withRlsContext,
} from '@/lib/auth/rbac'
import { requireRealUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/** DELETE /api/threads/[threadId] — requires ADMIN+ in the org. */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> }
) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  try {
    const { threadId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const userId = auth.user.id
    const orgId = String((body as { orgId?: string }).orgId || '')

    if (!threadId) {
      return NextResponse.json({ error: 'Missing threadId' }, { status: 400 })
    }
    if (!orgId) {
      return NextResponse.json(
        { error: ARABIC_AUTHZ_ERROR, code: 'MISSING_TENANT_CONTEXT' },
        { status: 401 }
      )
    }

    await assertPermission(
      userId,
      orgId,
      SENSITIVE_ACTION_ROLES.deleteThread,
      auth.user.email
    )

    const deleted = await withRlsContext({ userId, orgId }, async () => {
      return withPrismaFallback(
        () =>
          prisma.sessionThread.delete({
            where: { id: threadId },
          }),
        null
      )
    })

    if (!deleted) {
      return NextResponse.json(
        { error: 'الخيط غير موجود أو خارج نطاق صلاحياتك.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: 'تم حذف خيط المحادثة.',
      threadId,
    })
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status }
      )
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'error' },
      { status: 500 }
    )
  }
}
