import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser, requireRealUser } from '@/lib/auth/session'
import {
  loadUserAgentRoster,
  saveUserAgentRoster,
  type AgentRosterPayload,
} from '@/lib/rooms/roster-persist'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  try {
    const payload = await loadUserAgentRoster(auth.user.id)
    return NextResponse.json({
      ok: true,
      payload,
      synced: Boolean(payload),
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

  let body: { payload?: AgentRosterPayload }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 })
  }

  if (!body.payload || typeof body.payload !== 'object') {
    return NextResponse.json({ error: 'payload مطلوب' }, { status: 400 })
  }

  try {
    await saveUserAgentRoster(auth.user.id, body.payload)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'تعذّر الحفظ' },
      { status: 500 }
    )
  }
}
