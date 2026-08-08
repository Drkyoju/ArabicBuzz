import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { searchRoomUnified } from '@/lib/search/room-unified-search'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'

export const dynamic = 'force-dynamic'

/**
 * Privacy-safe unified search: org mail + room/knowledge files + room calendar.
 * Never searches other users' personal Gmail.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  const scopeId =
    req.nextUrl.searchParams.get('scopeId') || PRIMARY_TEAM_SCOPE_ID
  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get('limit') || '24'), 1),
    40
  )

  const { assertRoomCanAccess } = await import('@/lib/rooms/persist')
  const gate = await assertRoomCanAccess(
    scopeId,
    auth.user.id,
    auth.user.email
  )
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, hits: [] }, { status: 403 })
  }

  const result = await searchRoomUnified({ query: q, scopeId, limit })
  return NextResponse.json(result)
}
