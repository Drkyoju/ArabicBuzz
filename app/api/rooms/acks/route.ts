import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser, requireSessionUser } from '@/lib/auth/session'
import {
  listItemAcks,
  toggleItemAck,
  type ItemAckKind,
} from '@/lib/rooms/item-acks'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const itemKindRaw = req.nextUrl.searchParams.get('itemKind') || 'post'
  const itemKind: ItemAckKind =
    itemKindRaw === 'canvas' ? 'canvas' : 'post'
  const itemId = req.nextUrl.searchParams.get('itemId') || ''
  if (!itemId) {
    return NextResponse.json({ error: 'itemId مطلوب' }, { status: 400 })
  }
  const acks = await listItemAcks(itemKind, itemId)
  const myId = auth.user.id
  return NextResponse.json({
    acks,
    count: acks.length,
    seenByMe: acks.some((a) => a.userId === myId),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    itemKind?: string
    itemId?: string
    seen?: boolean
  }
  const scopeId = String(body.scopeId || 'shared-demo')
  const itemKind: ItemAckKind =
    body.itemKind === 'canvas' ? 'canvas' : 'post'
  const itemId = String(body.itemId || '')
  if (!itemId) {
    return NextResponse.json({ error: 'itemId مطلوب' }, { status: 400 })
  }
  const userAr =
    (auth.user.user_metadata?.full_name as string) ||
    auth.user.email?.split('@')[0] ||
    'عضو'
  const result = await toggleItemAck({
    scopeId,
    itemKind,
    itemId,
    userId: auth.user.id,
    userAr,
    seen: body.seen !== false,
  })
  return NextResponse.json({
    ...result,
    messageAr: result.seen ? 'سُجّل اطّلاعك' : 'أُلغي الاطّلاع',
  })
}
