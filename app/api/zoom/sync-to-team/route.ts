import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { syncZoomMeetingsToTeamCalendar } from '@/lib/zoom/sync-to-team'
import { teamCalendarScopeId } from '@/lib/scopes/team-calendar-scope'

export const dynamic = 'force-dynamic'

/** One-way: Zoom scheduled meetings → shared team calendar. */
export async function POST(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    meetingId?: string
  }
  const scopeId = teamCalendarScopeId(body.scopeId)
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
    const result = await syncZoomMeetingsToTeamCalendar({
      scopeId,
      meetingId: body.meetingId,
      createdBy: auth.user.id,
      createdByAr: auth.user.email || 'مستخدم',
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        created: 0,
        skipped: 0,
        scopeId,
        eventIds: [],
        messageAr:
          e instanceof Error ? e.message : 'تعذّرت مزامنة Zoom إلى تقويم الفريق',
      },
      { status: 500 }
    )
  }
}
