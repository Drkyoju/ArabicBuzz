import { describe, expect, it } from 'vitest'
import { groupRoomPostsWithReplies } from '@/lib/rooms/post-threads'
import type { RoomPost } from '@/lib/scopes/types'

function post(
  id: string,
  createdAt: number,
  parent?: string
): RoomPost {
  return {
    id,
    scopeId: 'shared-demo',
    authorKind: 'human',
    authorId: 'u1',
    authorNameAr: 'عضو',
    content: `msg ${id}`,
    createdAt,
    parentPostId: parent || null,
  }
}

describe('groupRoomPostsWithReplies', () => {
  it('nests one level of replies under parent', () => {
    const grouped = groupRoomPostsWithReplies([
      post('1', 100),
      post('2', 200, '1'),
      post('3', 300),
    ])
    expect(grouped).toHaveLength(2)
    expect(grouped[0]?.post.id).toBe('1')
    expect(grouped[0]?.replies.map((r) => r.id)).toEqual(['2'])
    expect(grouped[1]?.post.id).toBe('3')
    expect(grouped[1]?.replies).toHaveLength(0)
  })
})
