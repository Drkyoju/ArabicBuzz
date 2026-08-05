import { NextRequest, NextResponse } from 'next/server'
import {
  getUserFromRequest,
  isSyntheticUser,
  requireRealUser,
} from '@/lib/auth/session'
import {
  canAccessOpsUi,
  isDirectorEmail,
  labelArForEmail,
  orgRoleForEmail,
  personaForEmail,
  personaToRole,
  setOrgMemberRole,
  syncOrgRoleFromEmail,
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

/**
 * Current user's org role — driven strictly by director email allow-list.
 * Ryodan71 (and DIRECTOR_EMAILS) → مدير; everyone else → موظف.
 */
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  const orgId = defaultOrgId(req)
  const userId = user?.id || 'local-owner'
  const email = user?.email ?? null
  const allowSyntheticOwner = isSyntheticUser(user)

  const role = await syncOrgRoleFromEmail(userId, orgId, email, {
    allowSyntheticOwner,
  })
  const persona: UiPersona = personaForEmail(email, {
    userId,
    allowSyntheticOwner,
  })
  const labelAr = labelArForEmail(email, { userId, allowSyntheticOwner })
  const ops = canAccessOpsUi(role) && persona !== 'employee'

  return NextResponse.json({
    userId,
    orgId,
    email,
    role,
    persona,
    labelAr,
    displayNameAr:
      (user?.user_metadata?.full_name as string | undefined) ||
      user?.email ||
      null,
    uiMode: ops ? 'admin' : 'employee',
    canAccessOpsUi: ops,
    isDirector: isDirectorEmail(email),
    messageAr: ops
      ? 'واجهة المدير — موافقات وسجل عمل وتكاملات عالية المستوى.'
      : 'واجهة الموظف — غرف وملفات وتقويم وموافقات.',
  })
}

/**
 * Assign org role for a teammate.
 * Strict: elevated roles only for director allow-list emails; others stay موظف.
 * Body: { userId, email?, persona?: 'director'|'employee'|'admin', role?: Role, orgId? }
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    userId?: string
    email?: string
    persona?: string
    role?: string
    orgId?: string
  }
  const orgId =
    body.orgId?.trim() ||
    process.env.DEFAULT_ORG_ID ||
    'org-demo'

  const actorRole = orgRoleForEmail(auth.user.email, {
    userId: auth.user.id,
  })
  if (!canAccessOpsUi(actorRole) || !isDirectorEmail(auth.user.email)) {
    return NextResponse.json(
      { error: 'تعيين الأدوار للمدير المعتمد فقط.' },
      { status: 403 }
    )
  }

  const targetUserId = String(body.userId || '').trim()
  if (!targetUserId) {
    return NextResponse.json({ error: 'userId مطلوب' }, { status: 400 })
  }

  const targetEmail = body.email?.trim() || null

  let requested: Role | null = null
  if (body.role) {
    requested = personaToRole(body.role)
    const upper = body.role.toUpperCase()
    if (
      upper === 'OWNER' ||
      upper === 'ADMIN' ||
      upper === 'DEPARTMENT_MANAGER' ||
      upper === 'MEMBER' ||
      upper === 'AUDITOR'
    ) {
      requested = upper as Role
    }
  } else if (body.persona) {
    requested = personaToRole(body.persona)
  }

  if (!requested && !targetEmail) {
    return NextResponse.json(
      { error: 'حدّد persona أو role مع بريد الهدف' },
      { status: 400 }
    )
  }

  // Strict email rule — ignore self-promotion requests for non-directors.
  const nextRole = orgRoleForEmail(targetEmail, { userId: targetUserId })
  if (
    requested &&
    requested !== nextRole &&
    !isDirectorEmail(targetEmail) &&
    (requested === 'OWNER' ||
      requested === 'ADMIN' ||
      requested === 'DEPARTMENT_MANAGER')
  ) {
    return NextResponse.json(
      {
        error:
          'لا يمكن ترقية هذا الحساب إلى مدير. المدير محصور على البريد المعتمد.',
      },
      { status: 403 }
    )
  }

  const result = await setOrgMemberRole(targetUserId, orgId, nextRole, {
    email: targetEmail,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    userId: targetUserId,
    orgId,
    role: result.role,
    persona: personaForEmail(targetEmail, { userId: targetUserId }),
    labelAr: labelArForEmail(targetEmail, { userId: targetUserId }),
    messageAr: `تم تعيين الدور: ${labelArForEmail(targetEmail, {
      userId: targetUserId,
    })}`,
  })
}
