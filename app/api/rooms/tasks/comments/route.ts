import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser, requireSessionUser } from '@/lib/auth/session'
import { assertRoomCanEdit, assertRoomCanPost } from '@/lib/rooms/persist'
import { addTaskComment, listTaskComments } from '@/lib/rooms/task-comments'
import { displayNameFromUser } from '@/lib/auth/display-name'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const scopeId = req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  const taskId = req.nextUrl.searchParams.get('taskId') || ''
  if (!taskId) {
    return NextResponse.json({ error: 'taskId مطلوب' }, { status: 400 })
  }
  const comments = await listTaskComments(taskId, scopeId)
  return NextResponse.json({ comments, count: comments.length })
}

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    taskId?: string
    bodyAr?: string
  }
  const scopeId = String(body.scopeId || 'shared-demo')
  const taskId = String(body.taskId || '')
  const gate = await assertRoomCanPost(scopeId, auth.user.id, auth.user.email)
  if (!gate.ok) {
    const edit = await assertRoomCanEdit(scopeId, auth.user.id, auth.user.email)
    if (!edit.ok) {
      return NextResponse.json({ error: gate.error }, { status: 403 })
    }
  }
  const authorAr = displayNameFromUser(auth.user, 'عضو')
  try {
    const comment = await addTaskComment({
      taskId,
      scopeId,
      bodyAr: String(body.bodyAr || ''),
      authorId: auth.user.id,
      authorAr,
    })
    return NextResponse.json({ comment, messageAr: 'أُضيف التعليق' })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'فشل' },
      { status: 400 }
    )
  }
}
