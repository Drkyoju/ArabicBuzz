import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { displayNameFromUser } from '@/lib/auth/display-name'
import { buildTeamInbox } from '@/lib/rooms/team-inbox'

export const dynamic = 'force-dynamic'

/** Aggregated team inbox for current user + room. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const scopeId = req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  const displayNameAr = displayNameFromUser(auth.user)
  const inbox = await buildTeamInbox({
    scopeId,
    userId: auth.user.id,
    email: auth.user.email,
    displayNameAr,
  })
  return NextResponse.json({
    scopeId,
    ...inbox,
    messageAr: 'وارد الفريق — مهامك ودعواتك ومواعيدك القريبة.',
  })
}
