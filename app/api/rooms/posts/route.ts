import { requireUser, requireRealUser, isSyntheticUser } from '@/lib/auth/session'
import { insertRoomPost, listRoomPosts, assertRoomCanPost } from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const url = new URL(req.url)
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  const result = await listRoomPosts(scopeId)
  if (!result.ok) {
    return Response.json(
      { posts: [], warning: result.error || 'persist unavailable' },
      { status: 200 }
    )
  }
  return Response.json({ posts: result.posts })
}

export async function POST(req: Request) {
  const { enforceApiRateLimit } = await import('@/lib/reliability/rate-limit')
  const rl = await enforceApiRateLimit({ req, bucket: 'room-posts', limit: 30 })
  if (!rl.ok) {
    return Response.json(
      { error: 'تجاوزت حد الطلبات. حاول بعد لحظات.', code: 'RATE_LIMITED' },
      { status: 429 }
    )
  }
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  if (isSyntheticUser(auth.user)) {
    return Response.json(
      { error: 'يلزم تسجيل الدخول لحفظ الرسائل في الغرفة.' },
      { status: 401 }
    )
  }
  const body = (await req.json()) as {
    scopeId?: string
    content?: string
    authorKind?: 'human' | 'agent' | 'system' | 'channel'
    authorId?: string
    authorNameAr?: string
    mentionAgentId?: string
    id?: string
  }
  const scopeId = body.scopeId || 'shared-demo'
  const gate = await assertRoomCanPost(scopeId, auth.user.id, auth.user.email)
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: 403 })
  }
  const content = String(body.content || '').trim()
  if (!content) {
    return Response.json({ error: 'المحتوى مطلوب' }, { status: 400 })
  }
  if (content.length > 12_000) {
    return Response.json(
      { error: 'المحتوى طويل جداً (الحد ١٢ ألف حرف).' },
      { status: 400 }
    )
  }
  const name =
    body.authorNameAr ||
    auth.user.user_metadata?.full_name ||
    auth.user.email ||
    'مستخدم'
  const result = await insertRoomPost({
    id: body.id,
    scopeId,
    authorKind: body.authorKind || 'human',
    authorId: body.authorId || auth.user.id,
    authorNameAr: String(name),
    content,
    mentionAgentId: body.mentionAgentId,
  })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 })
  }
  try {
    const { logRoomActivity } = await import('@/lib/rooms/home-log')
    await logRoomActivity({
      scopeId,
      kind: 'message',
      actorAr: String(name),
      actorEmail: auth.user.email || null,
      actionAr: 'أرسل رسالة',
      detailAr: content.slice(0, 120),
    })
  } catch {
    /* ignore */
  }
  return Response.json({ post: result.post })
}
