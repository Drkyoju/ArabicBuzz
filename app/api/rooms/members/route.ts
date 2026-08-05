import { requireSessionUser, requireRealUser } from '@/lib/auth/session'
import { isSyntheticIdentity } from '@/lib/auth/synthetic'
import {
  addRoomMember,
  assertRoomOwner,
  getActorRoomRole,
  listRoomMembers,
  removeRoomMember,
} from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const scopeId =
    new URL(req.url).searchParams.get('scopeId') || 'shared-demo'
  const result = await listRoomMembers(scopeId)
  const myRole = await getActorRoomRole(
    scopeId,
    auth.user.id,
    auth.user.email
  )
  return Response.json({
    // Placeholder rows from the soft-auth fallback are not real invitees.
    members: result.members.map((m) =>
      isSyntheticIdentity(m) ? { ...m, email: null, userId: null } : m
    ),
    myRole,
    canManage: myRole === 'owner',
    source: result.source,
    warning: result.error,
  })
}

export async function POST(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json()) as {
    scopeId?: string
    displayNameAr?: string
    email?: string
    phone?: string
    committee?: string
    notesAr?: string
    memberId?: string
    action?: 'add' | 'update'
    role?: 'member' | 'editor' | 'viewer' | 'guest'
  }
  const scopeId = body.scopeId || 'shared-demo'
  const gate = await assertRoomOwner(scopeId, auth.user.id, auth.user.email)
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: 403 })
  }

  if (body.action === 'update' && body.memberId) {
    const { updateRoomMember } = await import('@/lib/rooms/persist')
    const role =
      body.role === 'editor' ||
      body.role === 'member' ||
      body.role === 'viewer' ||
      body.role === 'guest'
        ? body.role
        : undefined
    const result = await updateRoomMember({
      scopeId,
      memberId: body.memberId,
      displayNameAr: body.displayNameAr,
      email: body.email,
      phone: body.phone,
      committee: body.committee,
      notesAr: body.notesAr,
      role,
    })
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 })
    }

    // Mirror room director/employee onto org RBAC when the member has a userId.
    if (role && result.member?.userId) {
      const { setOrgMemberRole } = await import('@/lib/auth/rbac')
      const orgId = process.env.DEFAULT_ORG_ID || 'org-demo'
      await setOrgMemberRole(
        result.member.userId,
        orgId,
        role === 'editor' ? 'DEPARTMENT_MANAGER' : 'MEMBER'
      )
    }

    return Response.json({
      ok: true,
      member: result.member,
      messageAr:
        role === 'editor'
          ? 'عُيّن مديراً'
          : role === 'member'
            ? 'عُيّن موظفاً'
            : 'حُدّث سجل العضو',
    })
  }

  const name = String(body.displayNameAr || '').trim()
  if (!name) {
    return Response.json({ error: 'اكتب اسم العضو' }, { status: 400 })
  }
  const result = await addRoomMember({
    scopeId,
    displayNameAr: name,
    email: body.email || null,
    phone: body.phone || null,
    committee: body.committee || null,
    notesAr: body.notesAr || null,
    role: 'member',
  })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 })
  }
  return Response.json({
    ok: true,
    member: result.member,
    messageAr: `أُضيف «${name}» إلى سجل الأعضاء`,
  })
}

export async function DELETE(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const url = new URL(req.url)
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  const memberId = url.searchParams.get('memberId') || ''
  if (!memberId) {
    return Response.json({ error: 'memberId مطلوب' }, { status: 400 })
  }
  const gate = await assertRoomOwner(scopeId, auth.user.id, auth.user.email)
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: 403 })
  }
  const result = await removeRoomMember({ scopeId, memberId })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 })
  }
  return Response.json({ ok: true, messageAr: 'تم حذف العضو من الغرفة' })
}
