import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRealUser } from '@/lib/auth/session'
import {
  canAccessOpsUi,
  getMemberRole,
  personaToRole,
  roleLabelAr,
  roleToPersona,
  setOrgMemberRole,
  type Role,
  type UiPersona,
} from '@/lib/auth/rbac'

export const dynamic = 'force-dynamic'

function defaultOrgId(req: NextRequest) {
  return (
    req.nextUrl.searchParams.get('orgId') ||
    process.env.DEFAULT_ORG_ID ||
    'org-demo'
  )
}

function resolveRole(userId: string, stored: Role | null): Role {
  if (stored) return stored
  // Invite guests / unknown → employee surface
  return userId === 'local-owner' || userId === 'user-1' ? 'OWNER' : 'MEMBER'
}

/**
 * Current user's org role — drives employee vs director/admin UI.
 * Defaults: local-owner / user-1 → OWNER; unknown members → MEMBER (موظف).
 */
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  const orgId = defaultOrgId(req)
  const userId = user?.id || 'local-owner'
  const role = resolveRole(userId, await getMemberRole(userId, orgId))
  const persona: UiPersona = roleToPersona(role)
  const ops = canAccessOpsUi(role)
  return NextResponse.json({
    userId,
    orgId,
    role,
    persona,
    labelAr: roleLabelAr(role),
    displayNameAr:
      (user?.user_metadata?.full_name as string | undefined) ||
      user?.email ||
      null,
    uiMode: ops ? 'admin' : 'employee',
    canAccessOpsUi: ops,
    messageAr: ops
      ? persona === 'director'
        ? 'واجهة المدير — موافقات وسجل عمل وتكاملات عالية المستوى.'
        : 'واجهة المسؤول — كل الأقسام متاحة.'
      : 'واجهة الموظف — غرف وملفات وتقويم وموافقات.',
  })
}

/**
 * Admins/owners assign org role for a teammate (مدير / موظف / مسؤول).
 * Body: { userId, persona?: 'director'|'employee'|'admin', role?: Role, orgId? }
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    userId?: string
    persona?: string
    role?: string
    orgId?: string
  }
  const orgId =
    body.orgId?.trim() ||
    process.env.DEFAULT_ORG_ID ||
    'org-demo'
  const actorRole = resolveRole(
    auth.user.id,
    await getMemberRole(auth.user.id, orgId)
  )
  if (!canAccessOpsUi(actorRole) || roleToPersona(actorRole) === 'employee') {
    return NextResponse.json(
      { error: 'تعيين الأدوار للمسؤول أو المدير فقط.' },
      { status: 403 }
    )
  }
  // Only OWNER/ADMIN may promote to ADMIN; directors may set employee/director.
  const targetUserId = String(body.userId || '').trim()
  if (!targetUserId) {
    return NextResponse.json({ error: 'userId مطلوب' }, { status: 400 })
  }

  let nextRole: Role
  if (body.role) {
    nextRole = personaToRole(body.role)
    // Allow explicit Role enum strings too
    const upper = body.role.toUpperCase()
    if (
      upper === 'OWNER' ||
      upper === 'ADMIN' ||
      upper === 'DEPARTMENT_MANAGER' ||
      upper === 'MEMBER' ||
      upper === 'AUDITOR'
    ) {
      nextRole = upper as Role
    }
  } else if (body.persona) {
    nextRole = personaToRole(body.persona)
  } else {
    return NextResponse.json(
      { error: 'حدّد persona (مدير/موظف/مسؤول) أو role' },
      { status: 400 }
    )
  }

  if (
    (nextRole === 'OWNER' || nextRole === 'ADMIN') &&
    actorRole !== 'OWNER' &&
    actorRole !== 'ADMIN'
  ) {
    return NextResponse.json(
      { error: 'تعيين مسؤول يحتاج صلاحية مسؤول.' },
      { status: 403 }
    )
  }

  const result = await setOrgMemberRole(targetUserId, orgId, nextRole)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({
    ok: true,
    userId: targetUserId,
    orgId,
    role: nextRole,
    persona: roleToPersona(nextRole),
    labelAr: roleLabelAr(nextRole),
    messageAr: `تم تعيين الدور: ${roleLabelAr(nextRole)}`,
  })
}
