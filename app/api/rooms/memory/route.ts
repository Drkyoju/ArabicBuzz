import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import {
  addRoomMemory,
  listRoomMemories,
  removeRoomMemory,
} from '@/lib/rooms/room-memory'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const scopeId = req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  const memories = await listRoomMemories(scopeId)
  return NextResponse.json({
    scopeId,
    memories,
    texts: memories.map((m) => m.content),
    messageAr: 'ذاكرة الغرفة المشتركة — لكل الأعضاء، ليست على جهاز واحد.',
  })
}

export async function POST(req: NextRequest) {
  const { requireRealUser } = await import('@/lib/auth/session')
  const { assertRoomCanEdit } = await import('@/lib/rooms/persist')
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const user = auth.user
  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    scopeId?: string
    content?: string
    id?: string
  }
  const scopeId = String(body.scopeId || 'shared-demo')
  const gate = await assertRoomCanEdit(scopeId, user.id, user.email)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 })
  }
  const action = String(body.action || 'add')
  try {
    if (action === 'remove') {
      await removeRoomMemory(String(body.id || ''), scopeId)
      return NextResponse.json({ ok: true, messageAr: 'حُذفت من ذاكرة الغرفة' })
    }
    const mem = await addRoomMemory({
      scopeId,
      content: String(body.content || ''),
      createdBy: user.id,
      createdByAr:
        (user.user_metadata?.full_name as string) ||
        user.email?.split('@')[0] ||
        'عضو',
    })
    return NextResponse.json({
      ok: true,
      memory: mem,
      messageAr: 'أُضيفت لذاكرة الغرفة المشتركة',
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'فشل' },
      { status: 400 }
    )
  }
}
