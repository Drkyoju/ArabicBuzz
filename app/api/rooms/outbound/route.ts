import { requireUser } from '@/lib/auth/session'
import { insertRoomPost } from '@/lib/rooms/persist'
import { emitNotification } from '@/lib/notifications/emit'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Send a room message out to Telegram/WhatsApp (HITL-friendly outbound).
 */
export async function POST(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json()) as {
    scopeId?: string
    textAr?: string
    channel?: 'telegram' | 'whatsapp'
  }
  const textAr = String(body.textAr || '').trim()
  const channel = body.channel || 'telegram'
  const scopeId = body.scopeId || 'shared-ops'
  if (!textAr) {
    return Response.json({ error: 'النص مطلوب' }, { status: 400 })
  }

  await emitNotification({
    channel,
    textAr,
    meta: { scopeId, fromUserId: auth.user.id },
  })

  const post = await insertRoomPost({
    scopeId,
    authorKind: 'system',
    authorId: 'outbound',
    authorNameAr: channel === 'telegram' ? 'تيليجرام' : 'واتساب',
    content: `تم إرسال رسالة للخارج عبر ${channel === 'telegram' ? 'تيليجرام' : 'واتساب'}:\n${textAr}`,
    channel,
  })

  return Response.json({
    ok: true,
    post: post.post,
    noteAr:
      'إن لم تكن قنوات TELEGRAM_*/WHATSAPP_* مضبوطة على Netlify، يُسجَّل الحدث في الغرفة فقط.',
  })
}
