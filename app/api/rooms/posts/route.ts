import {
  requireSessionUser,
  requireRealUser,
  isSyntheticUser,
} from '@/lib/auth/session'
import {
  insertRoomPost,
  listRoomPosts,
  assertRoomCanPost,
  assertRoomCanEdit,
  updateRoomPostKind,
  listRoomMembers,
  deleteRoomPostsInRange,
  pruneExpiredRoomPosts,
} from '@/lib/rooms/persist'
import {
  extractMemberMentions,
  toMentionableMembers,
} from '@/lib/rooms/member-mentions'
import { findAgentByMention } from '@/lib/rooms/agents'
import {
  roomChatRetentionDays,
  riyadhTodayPostBoundsIso,
} from '@/lib/rooms/chat-retention'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const url = new URL(req.url)
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  const { assertRoomCanAccess } = await import('@/lib/rooms/persist')
  const gate = await assertRoomCanAccess(
    scopeId,
    auth.user.id,
    auth.user.email
  )
  if (!gate.ok) {
    return Response.json({ error: gate.error, posts: [] }, { status: 403 })
  }
  // On-read prune: drop messages older than retention (files archive untouched).
  try {
    await pruneExpiredRoomPosts({ scopeId })
  } catch {
    /* best-effort */
  }
  const result = await listRoomPosts(scopeId)
  if (!result.ok) {
    return Response.json(
      { posts: [], warning: result.error || 'persist unavailable' },
      { status: 200 }
    )
  }
  return Response.json({
    posts: result.posts,
    retentionDays: roomChatRetentionDays(),
  })
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
    action?: string
    scopeId?: string
    content?: string
    authorKind?: 'human' | 'agent' | 'system' | 'channel'
    authorId?: string
    authorNameAr?: string
    mentionAgentId?: string
    mentionUserIds?: string[]
    postKind?: 'chat' | 'decision' | 'minutes'
    postId?: string
    id?: string
  }
  const scopeId = body.scopeId || 'shared-demo'

  if (body.action === 'delete_today') {
    const editGate = await assertRoomCanEdit(
      scopeId,
      auth.user.id,
      auth.user.email
    )
    if (!editGate.ok) {
      return Response.json({ error: editGate.error }, { status: 403 })
    }
    const { from, to, ymd } = riyadhTodayPostBoundsIso()
    const deleted = await deleteRoomPostsInRange({
      scopeId,
      fromIso: from,
      toIso: to,
    })
    if (!deleted.ok) {
      return Response.json({ error: deleted.error }, { status: 500 })
    }
    const name =
      auth.user.user_metadata?.full_name ||
      auth.user.email ||
      'عضو'
    try {
      const { logRoomActivity } = await import('@/lib/rooms/home-log')
      await logRoomActivity({
        scopeId,
        kind: 'message',
        actorAr: String(name),
        actorEmail: auth.user.email || null,
        actionAr: 'حذف شات اليوم',
        detailAr: `حُذف ${deleted.deleted} رسالة ليوم ${ymd} (توقيت السعودية). أرشيف الملفات لم يُمس.`,
      })
    } catch {
      /* ignore */
    }
    return Response.json({
      ok: true,
      deleted: deleted.deleted,
      day: ymd,
      timezone: 'Asia/Riyadh',
      messageAr:
        deleted.deleted === 0
          ? 'لا رسائل ليوم اليوم في هذه الغرفة.'
          : `حُذف ${deleted.deleted} رسالة من شات اليوم (${ymd}، توقيت السعودية). أرشيف «ملفات الفريق» لم يُحذف.`,
    })
  }

  const gate = await assertRoomCanPost(scopeId, auth.user.id, auth.user.email)
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: 403 })
  }

  if (body.action === 'set_kind') {
    const postKind =
      body.postKind === 'decision' || body.postKind === 'minutes'
        ? body.postKind
        : 'chat'
    const updated = await updateRoomPostKind({
      scopeId,
      postId: String(body.postId || ''),
      postKind,
    })
    if (!updated.ok) {
      return Response.json({ error: updated.error }, { status: 400 })
    }
    return Response.json({
      post: updated.post,
      messageAr:
        postKind === 'decision'
          ? 'وُسِم كقرار'
          : postKind === 'minutes'
            ? 'وُسِم كمحضر'
            : 'أُعيد كرسالة عادية',
    })
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

  // Resolve @member mentions (skip tokens that match agents)
  let mentionUserIds = Array.isArray(body.mentionUserIds)
    ? body.mentionUserIds.map(String)
    : []
  try {
    const { members } = await listRoomMembers(scopeId)
    const mentionables = toMentionableMembers(members)
    const mentioned = extractMemberMentions(content, mentionables).filter(
      (m) => !findAgentByMention(`@${m.mentionToken}`)
    )
    if (mentioned.length) {
      const ids = mentioned
        .map((m) => m.userId)
        .filter((id): id is string => Boolean(id))
      mentionUserIds = [...new Set([...mentionUserIds, ...ids])]
      const { notifyMemberMentioned } = await import(
        '@/lib/notifications/team-notify'
      )
      for (const m of mentioned) {
        if (m.userId === auth.user.id) continue
        await notifyMemberMentioned({
          scopeId,
          mentionNameAr: m.displayNameAr,
          mentionUserId: m.userId,
          mentionEmail: m.email,
          fromAr: String(name),
          excerpt: content,
        })
      }
    }
  } catch {
    /* degrade — post still saves */
  }

  const postKind =
    body.postKind === 'decision' || body.postKind === 'minutes'
      ? body.postKind
      : 'chat'

  const result = await insertRoomPost({
    id: body.id,
    scopeId,
    authorKind: body.authorKind || 'human',
    authorId: body.authorId || auth.user.id,
    authorNameAr: String(name),
    content,
    mentionAgentId: body.mentionAgentId,
    mentionUserIds,
    postKind,
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
      actionAr:
        postKind === 'decision'
          ? 'سجّل قراراً'
          : postKind === 'minutes'
            ? 'سجّل محضراً'
            : 'أرسل رسالة',
      detailAr: content.slice(0, 120),
    })
  } catch {
    /* ignore */
  }
  return Response.json({ post: result.post })
}
