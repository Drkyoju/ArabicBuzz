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

  const sent = await emitNotification({
    channel,
    textAr,
    meta: { scopeId, fromUserId: auth.user.id },
  })

  const post = await insertRoomPost({
    scopeId,
    authorKind: 'system',
    authorId: 'outbound',
    authorNameAr: channel === 'telegram' ? 'تيليجرام' : 'واتساب',
    content: sent.ok
      ? `تم إرسال رسالة للخارج عبر ${channel === 'telegram' ? 'تيليجرام' : 'واتساب'}:\n${textAr}`
      : `تعذّر الإرسال عبر ${channel === 'telegram' ? 'تيليجرام' : 'واتساب'} (تحقق من مفاتيح القناة). النص:\n${textAr}`,
    channel,
  })

  if (!sent.ok) {
    return Response.json(
      {
        ok: false,
        post: post.post,
        error:
          channel === 'telegram'
            ? 'تعذّر الإرسال لتيليجرام — اضبط TELEGRAM_BOT_TOKEN و TELEGRAM_OWNER_CHAT_ID (أو TELEGRAM_TEST_CHAT_ID).'
            : 'تعذّر الإرسال لواتساب — اضبط WHATSAPP_TOKEN و WHATSAPP_PHONE_NUMBER_ID و WHATSAPP_OWNER_TO (أو WHATSAPP_TEST_TO).',
      },
      { status: 502 }
    )
  }

  return Response.json({
    ok: true,
    post: post.post,
    noteAr: `أُرسلت الرسالة عبر ${channel === 'telegram' ? 'تيليجرام' : 'واتساب'}.`,
  })
}
