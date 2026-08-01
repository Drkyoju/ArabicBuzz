import { requireUser } from '@/lib/auth/session'
import { createRoomInvite, listRoomInvites } from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const scopeId =
    new URL(req.url).searchParams.get('scopeId') || 'shared-demo'
  const result = await listRoomInvites(scopeId)
  return Response.json({
    invites: result.invites,
    warning: result.ok ? undefined : result.error,
  })
}

export async function POST(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json()) as { scopeId?: string; email?: string }
  const email = String(body.email || '').trim()
  if (!email || !email.includes('@')) {
    return Response.json({ error: 'بريد إلكتروني غير صالح' }, { status: 400 })
  }
  const result = await createRoomInvite({
    scopeId: body.scopeId || 'shared-demo',
    email,
    invitedBy: auth.user.id,
  })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 })
  }
  return Response.json({
    invite: result.invite,
    messageAr: `تمت دعوة ${email} إلى الغرفة. بعد قبول Google/GitHub بنفس البريد يمكنهم الدخول.`,
  })
}
