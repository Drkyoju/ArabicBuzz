import { requireUser } from '@/lib/auth/session'
import {
  assertRoomOwner,
  createRoomInvite,
  listRoomInvites,
  revokeInvite,
} from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const scopeId =
    new URL(req.url).searchParams.get('scopeId') || 'shared-demo'
  const result = await listRoomInvites(scopeId)
  return Response.json({
    invites: result.invites,
    warning: 'error' in result ? result.error : undefined,
  })
}

export async function POST(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json()) as {
    scopeId?: string
    email?: string
    kind?: 'email' | 'link'
    displayNameAr?: string
  }
  const scopeId = body.scopeId || 'shared-demo'
  const gate = await assertRoomOwner(scopeId, auth.user.id, auth.user.email)
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: 403 })
  }
  const kind = body.kind === 'link' ? 'link' : 'email'
  const result = await createRoomInvite({
    scopeId,
    email: body.email,
    invitedBy: auth.user.id,
    displayNameAr: body.displayNameAr,
    kind,
  })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 })
  }

  const inviteUrl = result.invite.inviteUrl
  const mailto =
    kind === 'email' && body.email
      ? `mailto:${encodeURIComponent(body.email)}?subject=${encodeURIComponent(
          'دعوة إلى غرفة Arabic Buzz'
        )}&body=${encodeURIComponent(
          `مرحباً،\n\nتمت دعوتك إلى غرفة عمل على Arabic Buzz.\nافتح الرابط للانضمام:\n${inviteUrl}\n`
        )}`
      : null

  return Response.json({
    invite: result.invite,
    inviteUrl,
    mailto,
    emailSent: false,
    messageAr:
      kind === 'link'
        ? 'رابط الدعوة جاهز — انسخه وأرسله لمن تريد.'
        : 'سُجّلت الدعوة. لا يوجد مُرسل بريد آلي بعد — انسخ الرابط أو افتح بريدك لإرسال الدعوة يدوياً.',
  })
}

export async function DELETE(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const url = new URL(req.url)
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  const inviteId = url.searchParams.get('inviteId') || ''
  if (!inviteId) {
    return Response.json({ error: 'inviteId مطلوب' }, { status: 400 })
  }
  const gate = await assertRoomOwner(scopeId, auth.user.id, auth.user.email)
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: 403 })
  }
  const result = await revokeInvite({ scopeId, inviteId })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 })
  }
  return Response.json({ ok: true, messageAr: 'أُلغيت الدعوة' })
}
