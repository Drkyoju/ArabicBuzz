import { requireUser } from '@/lib/auth/session'
import { reportRoomMembersAttendance } from '@/lib/rooms/association-reports'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const { searchParams } = new URL(req.url)
  const scopeId = searchParams.get('scopeId')?.trim() || 'shared-demo'
  const days = Number(searchParams.get('days') || 14)
  const report = await reportRoomMembersAttendance({ scopeId, days })
  return Response.json(report)
}

export async function POST(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    days?: number
  }
  const report = await reportRoomMembersAttendance({
    scopeId: body.scopeId?.trim() || 'shared-demo',
    days: body.days,
  })
  return Response.json(report)
}
