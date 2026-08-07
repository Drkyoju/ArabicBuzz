import { NextRequest, NextResponse } from 'next/server'
import {
  requireRealUser,
  requireSessionUser,
  isSyntheticUser,
} from '@/lib/auth/session'
import { insertRoomPost, assertRoomCanPost } from '@/lib/rooms/persist'
import {
  getTelegramLinkStatus,
  listTelegramFeed,
} from '@/lib/rooms/telegram-feed'
import { emitNotification } from '@/lib/notifications/emit'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MAX_TEXT_LENGTH = 4000

async function assertRoomCanRead(
  scopeId: string,
  userId: string,
  email?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { assertRoomCanAccess } = await import('@/lib/rooms/persist')
  return assertRoomCanAccess(scopeId, userId, email)
}

/** List recent Telegram ↔ site mirror messages for the home window. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const scopeId = req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  const gate = await assertRoomCanRead(scopeId, auth.user.id, auth.user.email)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 })
  }

  const limitRaw = Number(req.nextUrl.searchParams.get('limit') || '40')
  const limit = Number.isFinite(limitRaw) ? limitRaw : 40
  const [feed, link] = await Promise.all([
    listTelegramFeed(scopeId, limit),
    getTelegramLinkStatus(scopeId),
  ])

  return NextResponse.json({
    scopeId,
    linked: link.linked,
    link,
    items: feed.items,
    warning: feed.ok ? undefined : feed.error,
    messageAr: link.linked
      ? 'نافذة تيليجرام — الرسائل هنا تظهر أيضاً في المحادثة المربوطة.'
      : link.hintAr,
  })
}

/**
 * Site → Telegram: send to the linked chat and mirror into the room feed
 * so other members see it on لوحة اليوم.
 */
export async function POST(req: Request) {
  const { enforceApiRateLimit } = await import('@/lib/reliability/rate-limit')
  const rl = await enforceApiRateLimit({
    req,
    bucket: 'telegram-feed',
    limit: 20,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'تجاوزت حد الطلبات. حاول بعد لحظات.', code: 'RATE_LIMITED' },
      { status: 429 }
    )
  }

  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  if (isSyntheticUser(auth.user)) {
    return NextResponse.json(
      { error: 'يلزم تسجيل الدخول لإرسال رسائل تيليجرام.' },
      { status: 401 }
    )
  }

  const body = (await req.json()) as { scopeId?: string; textAr?: string }
  const scopeId = body.scopeId || 'shared-demo'
  const textAr = String(body.textAr || '').trim()
  if (!textAr) {
    return NextResponse.json({ error: 'النص مطلوب' }, { status: 400 })
  }
  if (textAr.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: 'النص طويل جدًا' }, { status: 400 })
  }

  const gate = await assertRoomCanPost(scopeId, auth.user.id, auth.user.email)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 })
  }

  const link = await getTelegramLinkStatus(scopeId)
  if (!link.botConfigured) {
    return NextResponse.json(
      {
        ok: false,
        linked: false,
        link,
        error: link.hintAr,
      },
      { status: 503 }
    )
  }
  if (!link.linked) {
    return NextResponse.json(
      {
        ok: false,
        linked: false,
        link,
        error: link.hintAr,
      },
      { status: 409 }
    )
  }

  const displayNameAr =
    (auth.user.user_metadata?.full_name as string) ||
    auth.user.email?.split('@')[0] ||
    'عضو'
  const outboundText = `من الموقع · ${displayNameAr}:\n${textAr}`

  const sent = await emitNotification({
    channel: 'telegram',
    textAr: outboundText,
    meta: { scopeId, fromUserId: auth.user.id },
  })

  const post = await insertRoomPost({
    scopeId,
    authorKind: 'human',
    authorId: auth.user.id,
    authorNameAr: displayNameAr,
    content: textAr,
    channel: 'telegram',
  })

  if (!sent.ok) {
    return NextResponse.json(
      {
        ok: false,
        linked: true,
        link,
        post: post.post,
        error:
          'تعذّر الإرسال لتيليجرام — تحقق من ربط المحادثة أو TELEGRAM_OWNER_CHAT_ID.',
      },
      { status: 502 }
    )
  }

  const feed = await listTelegramFeed(scopeId, 40)
  return NextResponse.json({
    ok: true,
    linked: true,
    link,
    post: post.post,
    items: feed.items,
    noteAr: 'أُرسلت الرسالة إلى تيليجرام وظهرت في نافذة الغرفة.',
  })
}
