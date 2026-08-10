import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getUpcomingZoomSnapshot } from '@/lib/zoom/upcoming'
import { teamCalendarScopeId } from '@/lib/scopes/team-calendar-scope'

export const dynamic = 'force-dynamic'

/** Upcoming Zoom meetings (Zoom API + shared room calendar Zoom links). */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const scopeId = teamCalendarScopeId(
    req.nextUrl.searchParams.get('scopeId')
  )
  const { assertRoomCanAccess } = await import('@/lib/rooms/persist')
  const gate = await assertRoomCanAccess(
    scopeId,
    auth.user.id,
    auth.user.email
  )
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 })
  }
  try {
    const snap = await getUpcomingZoomSnapshot({ scopeId })
    return NextResponse.json(snap)
  } catch (e) {
    return NextResponse.json(
      {
        configured: false,
        count: 0,
        meetings: [],
        scopeId,
        checkedAt: new Date().toISOString(),
        messageAr: e instanceof Error ? e.message : 'فشل جلب مواعيد Zoom',
      },
      { status: 500 }
    )
  }
}
