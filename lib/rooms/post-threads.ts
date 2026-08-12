import type { RoomPost } from '@/lib/scopes/types'

/** Group flat posts into top-level + one level of replies. */
export function groupRoomPostsWithReplies(posts: RoomPost[]): Array<{
  post: RoomPost
  replies: RoomPost[]
}> {
  const byId = new Map(posts.map((p) => [p.id, p]))
  const repliesByParent = new Map<string, RoomPost[]>()
  const topLevel: RoomPost[] = []

  for (const p of posts) {
    const parentId = p.parentPostId?.trim()
    if (parentId && byId.has(parentId)) {
      const list = repliesByParent.get(parentId) || []
      list.push(p)
      repliesByParent.set(parentId, list)
    } else {
      topLevel.push(p)
    }
  }

  topLevel.sort((a, b) => a.createdAt - b.createdAt)
  for (const list of repliesByParent.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt)
  }

  return topLevel.map((post) => ({
    post,
    replies: repliesByParent.get(post.id) || [],
  }))
}
