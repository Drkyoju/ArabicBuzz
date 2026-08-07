import { requireSessionUser, requireRealUser } from '@/lib/auth/session'
import {
  assertRoomOwner,
  createRoomInvite,
  listRoomInvites,
  revokeInvite,
} from '@/lib/rooms/persist'
import { sendInviteEmail } from '@/lib/email/resend'
import { emitNotification } from '@/lib/notifications/emit'
import { DEMO_SCOPES } from '@/lib/scopes/manager'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const scopeId =
    new URL(req.url).searchParams.get('scopeId') || 'shared-demo'
  const { assertRoomCanAccess } = await import('@/lib/rooms/persist')
  const gate = await assertRoomCanAccess(
    scopeId,
    auth.user.id,
    auth.user.email
  )
  if (!gate.ok) {
    return Response.json({ error: gate.error, invites: [] }, { status: 403 })
  }
  const { isPersonalScopeId } = await import('@/lib/scopes/personal-desk')
  if (isPersonalScopeId(scopeId)) {
    return Response.json({
      invites: [],
      messageAr: 'لا دعوات في المساحة الشخصية.',
    })
  }
  const result = await listRoomInvites(scopeId)
  return Response.json({
    invites: result.invites,
    warning: 'error' in result ? result.error : undefined,
  })
}

export async function POST(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json()) as {
    scopeId?: string
    email?: string
    kind?: 'email' | 'link'
    displayNameAr?: string
    notifyChannels?: Array<'telegram' | 'whatsapp'>
  }
  const scopeId = body.scopeId || 'shared-demo'
  const { isPersonalScopeId } = await import('@/lib/scopes/personal-desk')
  if (isPersonalScopeId(scopeId)) {
    return Response.json(
      {
        error:
          'مساحتك الشخصية فردية — لا يمكن دعوة أعضاء إليها. استخدم غرفة الفريق للعمل المشترك.',
      },
      { status: 403 }
    )
  }
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

  const inviteUrl = result.invite.inviteUrl || ''
  const roomNameAr =
    DEMO_SCOPES.find((s) => s.id === scopeId)?.nameAr || scopeId
  const inviterNameAr = String(
    auth.user.user_metadata?.full_name || auth.user.email || 'زميل'
  )

  const mailto =
    kind === 'email' && body.email
      ? `mailto:${encodeURIComponent(body.email)}?subject=${encodeURIComponent(
          `دعوة إلى ${roomNameAr} على Arabic Buzz`
        )}&body=${encodeURIComponent(
          `مرحباً،\n\n${inviterNameAr} دعاك إلى «${roomNameAr}» على Arabic Buzz.\nافتح الرابط للانضمام:\n${inviteUrl}\n`
        )}`
      : null

  let emailSent = false
  let emailNote: string | undefined
  if (kind === 'email' && body.email) {
    const sent = await sendInviteEmail({
      to: body.email,
      inviteUrl,
      roomNameAr,
      inviterNameAr,
    })
    emailSent = sent.ok
    emailNote = sent.skipped
      ? 'إرسال البريد يحتاج ضبط RESEND_API_KEY — انسخ الرابط وشاركه يدوياً (النسخ يعمل دائماً).'
      : sent.error
  }

  const channels = Array.isArray(body.notifyChannels)
    ? body.notifyChannels
    : []
  const channelResults: Record<string, boolean> = {}
  const inviteText = [
    `📨 دعوة للانضمام إلى «${roomNameAr}» على Arabic Buzz`,
    ``,
    `من: ${inviterNameAr}`,
    `افتح الرابط (يعمل على الجوال والمتصفح):`,
    inviteUrl,
    ``,
    `بعد الدخول ستظهر الغرفة المشتركة والتقويم والملفات.`,
  ].join('\n')
  for (const ch of channels) {
    if (ch !== 'telegram' && ch !== 'whatsapp') continue
    const r = await emitNotification({
      channel: ch,
      textAr: inviteText,
      meta: { kind: 'invite', scopeId, inviteUrl },
    })
    channelResults[ch] = r.ok
  }

  const channelHint =
    channels.length > 0
      ? Object.entries(channelResults)
          .map(([k, ok]) => `${k}: ${ok ? 'أُرسل' : 'فشل/غير مضبوط'}`)
          .join(' · ')
      : ''

  return Response.json({
    invite: result.invite,
    inviteUrl,
    mailto,
    emailSent,
    channelResults,
    messageAr:
      kind === 'link'
        ? `رابط الدعوة جاهز — انسخه وأرسله لمن تريد.${channelHint ? ` (${channelHint})` : ''}`
        : emailSent
          ? `أُرسلت الدعوة بالبريد إلى ${body.email}.${channelHint ? ` (${channelHint})` : ''}`
          : `سُجّلت الدعوة.${emailNote ? ` ${emailNote}` : ' انسخ الرابط أو افتح بريدك.'}${channelHint ? ` (${channelHint})` : ''}`,
  })
}

export async function DELETE(req: Request) {
  const auth = await requireRealUser(req)
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
