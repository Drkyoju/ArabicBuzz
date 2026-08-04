import { requireUser } from '@/lib/auth/session'
import { buildAccreditationPack } from '@/lib/rooms/accreditation-export'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    titleAr?: string
    minutesAr?: string
    meetingDateAr?: string
    fileIds?: string[]
    includeAttendance?: boolean
  }
  const result = await buildAccreditationPack({
    scopeId: body.scopeId || 'shared-demo',
    titleAr: body.titleAr,
    minutesAr: body.minutesAr,
    meetingDateAr: body.meetingDateAr,
    fileIds: body.fileIds,
    includeAttendance: body.includeAttendance,
    userId: auth.user.id,
  })
  return Response.json(result, { status: result.ok ? 200 : 422 })
}
