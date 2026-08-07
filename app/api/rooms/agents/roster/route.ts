import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser, requireRealUser } from '@/lib/auth/session'
import {
  loadRosterForScope,
  saveRosterForScope,
  type AgentRosterPayload,
} from '@/lib/rooms/roster-persist'
import { usesSharedRoomRoster } from '@/lib/rooms/roster-scope'
import { assertRoomCanEdit, assertRoomCanPost } from '@/lib/rooms/persist'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'

export const dynamic = 'force-dynamic'

function resolveScopeId(req: NextRequest, bodyScope?: unknown): string {
  const q = req.nextUrl.searchParams.get('scopeId')?.trim()
  if (q) return q
  if (typeof bodyScope === 'string' && bodyScope.trim()) return bodyScope.trim()
  return PRIMARY_TEAM_SCOPE_ID
}

export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const scopeId = resolveScopeId(req)
  const canPost = await assertRoomCanPost(
    scopeId,
    auth.user.id,
    auth.user.email
  )
  if (!canPost.ok) {
    return NextResponse.json({ error: canPost.error }, { status: 403 })
  }

  try {
    const { payload, shared, synced } = await loadRosterForScope({
      scopeId,
      userId: auth.user.id,
    })
    return NextResponse.json({
      ok: true,
      scopeId,
      shared,
      payload,
      synced,
      hintAr: shared
        ? 'مقاعد الوكلاء مشتركة بين كل موظفي هذه الغرفة.'
        : 'قائمة وكلاء مكتبك الشخصي — خاصة بحسابك.',
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'تعذّر التحميل' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  let body: { payload?: AgentRosterPayload; scopeId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 })
  }

  if (!body.payload || typeof body.payload !== 'object') {
    return NextResponse.json({ error: 'payload مطلوب' }, { status: 400 })
  }

  const scopeId = resolveScopeId(req, body.scopeId)
  const canEdit = await assertRoomCanEdit(
    scopeId,
    auth.user.id,
    auth.user.email
  )
  if (!canEdit.ok) {
    return NextResponse.json({ error: canEdit.error }, { status: 403 })
  }

  try {
    const { shared } = await saveRosterForScope({
      scopeId,
      userId: auth.user.id,
      payload: body.payload,
    })
    return NextResponse.json({
      ok: true,
      scopeId,
      shared,
      usesSharedRoomRoster: usesSharedRoomRoster(scopeId),
      hintAr: shared
        ? 'حُفظت مقاعد الوكلاء للغرفة — يراها كل الموظفين.'
        : 'حُفظت قائمة الوكلاء على حسابك.',
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'تعذّر الحفظ' },
      { status: 500 }
    )
  }
}
