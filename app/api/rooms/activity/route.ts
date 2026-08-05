import { requireSessionUser } from '@/lib/auth/session'
import {
  listCanvasArtifacts,
  listRoomMembers,
  listRoomPosts,
} from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'

/**
 * Room activity: full-ish history of posts + canvas editors + members.
 */
export async function GET(req: Request) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const url = new URL(req.url)
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  const limit = Math.min(
    500,
    Math.max(40, Number(url.searchParams.get('limit') || 200) || 200)
  )

  const [posts, canvas, members] = await Promise.all([
    listRoomPosts(scopeId, limit),
    listCanvasArtifacts(scopeId),
    listRoomMembers(scopeId),
  ])

  const events: Array<{
    id: string
    kind: 'post' | 'canvas' | 'system'
    titleAr: string
    detailAr: string
    actorAr: string
    at: number
  }> = []

  for (const p of posts.posts) {
    events.push({
      id: `post-${p.id}`,
      kind: p.authorKind === 'system' ? 'system' : 'post',
      titleAr:
        p.authorKind === 'system'
          ? 'حدث نظام'
          : p.authorKind === 'agent'
            ? 'رد وكيل'
            : 'رسالة بشرية',
      detailAr: p.content.slice(0, 220),
      actorAr: p.authorNameAr,
      at: p.createdAt,
    })
  }

  for (const row of canvas.rows as Array<Record<string, string>>) {
    const updatedAt = row.updated_at
      ? new Date(row.updated_at).getTime()
      : Date.now()
    events.push({
      id: `canvas-${row.id}`,
      kind: 'canvas',
      titleAr: 'تعديل لوحة',
      detailAr: row.title_ar || row.id,
      actorAr: row.updated_by || 'غير معروف',
      at: updatedAt,
    })
  }

  events.sort((a, b) => b.at - a.at)

  const lastHuman = [...posts.posts]
    .reverse()
    .find((p) => p.authorKind === 'human')
  const lastAny = posts.posts[posts.posts.length - 1]
  const lastCanvas = (canvas.rows as Array<Record<string, string>>)[0]

  return Response.json({
    scopeId,
    members: members.members,
    totalEvents: events.length,
    now: {
      lastHumanMessage: lastHuman
        ? {
            authorAr: lastHuman.authorNameAr,
            content: lastHuman.content.slice(0, 120),
            at: lastHuman.createdAt,
          }
        : null,
      lastAnyActivity: lastAny
        ? {
            authorAr: lastAny.authorNameAr,
            kind: lastAny.authorKind,
            at: lastAny.createdAt,
          }
        : null,
      lastCanvasEdit: lastCanvas
        ? {
            titleAr: lastCanvas.title_ar,
            updatedBy: lastCanvas.updated_by || null,
            at: lastCanvas.updated_at
              ? new Date(lastCanvas.updated_at).getTime()
              : null,
          }
        : null,
      memberCount: members.members.length,
    },
    events,
  })
}
