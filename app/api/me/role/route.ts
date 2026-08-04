import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth/session'
import { getMemberRole, type Role } from '@/lib/auth/rbac'

export const dynamic = 'force-dynamic'

/**
 * Current user's org role — drives employee vs admin UI.
 * Defaults: local-owner / user-1 → OWNER; unknown members → MEMBER.
 */
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  const orgId =
    req.nextUrl.searchParams.get('orgId') ||
    process.env.DEFAULT_ORG_ID ||
    'org-demo'
  const userId = user?.id || 'local-owner'
  let role: Role | null = await getMemberRole(userId, orgId)
  if (!role) {
    // Invite guests / unknown → employee surface
    role =
      userId === 'local-owner' || userId === 'user-1' ? 'OWNER' : 'MEMBER'
  }
  const isAdmin =
    role === 'OWNER' || role === 'ADMIN' || role === 'DEPARTMENT_MANAGER'
  return NextResponse.json({
    userId,
    orgId,
    role,
    uiMode: isAdmin ? 'admin' : 'employee',
    messageAr: isAdmin
      ? 'واجهة المسؤول — كل الأقسام متاحة.'
      : 'واجهة الموظف — غرف وملفات وتقويم وموافقات.',
  })
}
