import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import {
  createRoomTask,
  listRoomTasks,
  reconcileRoomTasks,
  updateRoomTask,
  type RoomTaskStatus,
} from '@/lib/rooms/room-tasks'

export const dynamic = 'force-dynamic'

/** Shared tasks/orders board for the room. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const scopeId = req.nextUrl.searchParams.get('scopeId') || 'shared-demo'
  const tasks = await listRoomTasks(scopeId)
  return NextResponse.json({
    scopeId,
    tasks,
    count: tasks.length,
    messageAr: 'لوحة مهام الغرفة — مشتركة للجميع وللوكيل.',
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
    titleAr?: string
    notesAr?: string
    priority?: number
    dueAt?: string
    assigneeAr?: string
    assigneeEmail?: string
    assigneeUserId?: string
    taskId?: string
    patch?: Record<string, unknown>
    shiftOverdueDays?: number
  }
  const scopeId = String(body.scopeId || 'shared-demo')
  const gate = await assertRoomCanEdit(scopeId, user.id, user.email)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 })
  }
  const action = String(body.action || 'create')
  const createdByAr =
    (user.user_metadata?.full_name as string) ||
    user.email?.split('@')[0] ||
    'عضو'

  const selfAliases = /^(لي|إلي|انا|أنا|نفسي|لنفسي)$/u
  function resolveSelfAssignee(raw: string | null | undefined): {
    assigneeAr?: string | null
    assigneeEmail?: string | null
    assigneeUserId?: string | null
  } {
    if (raw == null) return {}
    const t = String(raw).trim()
    if (!selfAliases.test(t)) {
      return { assigneeAr: t || null }
    }
    return {
      assigneeAr: createdByAr,
      assigneeEmail: user.email || null,
      assigneeUserId: user.id,
    }
  }

  try {
    if (action === 'reconcile') {
      const result = await reconcileRoomTasks({
        scopeId,
        shiftOverdueDays: body.shiftOverdueDays,
      })
      return NextResponse.json(result)
    }
    if (action === 'update') {
      const prevList = await listRoomTasks(scopeId, { includeDone: true })
      const prev = prevList.find((t) => t.id === String(body.taskId || ''))
      let patchAssigneeAr =
        body.patch?.assigneeAr !== undefined
          ? body.patch.assigneeAr == null
            ? null
            : String(body.patch.assigneeAr)
          : undefined
      let patchAssigneeEmail =
        body.patch?.assigneeEmail !== undefined
          ? body.patch.assigneeEmail == null
            ? null
            : String(body.patch.assigneeEmail)
          : undefined
      let patchAssigneeUserId =
        body.patch?.assigneeUserId !== undefined
          ? body.patch.assigneeUserId == null
            ? null
            : String(body.patch.assigneeUserId)
          : undefined

      if (patchAssigneeAr != null && selfAliases.test(patchAssigneeAr.trim())) {
        const self = resolveSelfAssignee(patchAssigneeAr)
        patchAssigneeAr = self.assigneeAr ?? patchAssigneeAr
        patchAssigneeEmail = self.assigneeEmail ?? patchAssigneeEmail
        patchAssigneeUserId = self.assigneeUserId ?? patchAssigneeUserId
      }

      const task = await updateRoomTask(String(body.taskId || ''), scopeId, {
        titleAr:
          body.patch?.titleAr != null ? String(body.patch.titleAr) : undefined,
        notesAr:
          body.patch?.notesAr !== undefined
            ? body.patch.notesAr == null
              ? null
              : String(body.patch.notesAr)
            : undefined,
        status:
          body.patch?.status === 'open' ||
          body.patch?.status === 'in_progress' ||
          body.patch?.status === 'done' ||
          body.patch?.status === 'cancelled'
            ? (body.patch.status as RoomTaskStatus)
            : undefined,
        priority:
          typeof body.patch?.priority === 'number'
            ? body.patch.priority
            : undefined,
        dueAt:
          body.patch?.dueAt !== undefined
            ? body.patch.dueAt == null
              ? null
              : String(body.patch.dueAt)
            : undefined,
        assigneeAr: patchAssigneeAr,
        assigneeEmail: patchAssigneeEmail,
        assigneeUserId: patchAssigneeUserId,
        sortOrder:
          typeof body.patch?.sortOrder === 'number'
            ? body.patch.sortOrder
            : undefined,
      })

      const assigneeChanged =
        (patchAssigneeAr !== undefined &&
          patchAssigneeAr !== (prev?.assigneeAr ?? null)) ||
        (patchAssigneeEmail !== undefined &&
          patchAssigneeEmail !== (prev?.assigneeEmail ?? null)) ||
        (patchAssigneeUserId !== undefined &&
          patchAssigneeUserId !== (prev?.assigneeUserId ?? null))

      if (assigneeChanged && task.assigneeAr) {
        try {
          const { notifyTaskAssigned } = await import(
            '@/lib/notifications/team-notify'
          )
          await notifyTaskAssigned({
            scopeId,
            titleAr: task.titleAr,
            assigneeAr: task.assigneeAr,
            assigneeEmail: task.assigneeEmail,
            assigneeUserId: task.assigneeUserId,
            assignerAr: createdByAr,
          })
        } catch {
          /* degrade gracefully */
        }
      }

      return NextResponse.json({ task, messageAr: 'حُدّثت المهمة' })
    }
    const selfCreate = resolveSelfAssignee(body.assigneeAr)
    const task = await createRoomTask({
      scopeId,
      titleAr: String(body.titleAr || ''),
      notesAr: body.notesAr,
      priority: body.priority,
      dueAt: body.dueAt,
      assigneeAr:
        selfCreate.assigneeAr !== undefined
          ? selfCreate.assigneeAr || undefined
          : body.assigneeAr,
      assigneeEmail:
        selfCreate.assigneeEmail !== undefined
          ? selfCreate.assigneeEmail || undefined
          : body.assigneeEmail,
      assigneeUserId:
        selfCreate.assigneeUserId !== undefined
          ? selfCreate.assigneeUserId || undefined
          : body.assigneeUserId,
      source: 'manual',
      createdBy: user?.id,
      createdByAr,
    })
    if (task.assigneeAr) {
      try {
        const { notifyTaskAssigned } = await import(
          '@/lib/notifications/team-notify'
        )
        await notifyTaskAssigned({
          scopeId,
          titleAr: task.titleAr,
          assigneeAr: task.assigneeAr,
          assigneeEmail: task.assigneeEmail,
          assigneeUserId: task.assigneeUserId,
          assignerAr: createdByAr,
        })
      } catch {
        /* degrade gracefully */
      }
    }
    return NextResponse.json({
      task,
      messageAr: 'أُضيفت للوحة مهام الغرفة',
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'فشل' },
      { status: 400 }
    )
  }
}
