import {
  createRoomTask,
  listRoomTasks,
  reconcileRoomTasks,
  updateRoomTask,
} from '@/lib/rooms/room-tasks'
import { addRoomMemory, listRoomMemories } from '@/lib/rooms/room-memory'

function scopeOf(p: Record<string, unknown>) {
  return String(p.scopeId || 'shared-demo')
}

export async function executeRoomTasksList(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const tasks = await listRoomTasks(scopeId)
  return {
    ok: true,
    count: tasks.length,
    tasks,
    messageAr: `لوحة مهام الغرفة: ${tasks.length} بنداً مشتركاً.`,
  }
}

export async function executeRoomTasksCreate(
  _n: string,
  params: Record<string, unknown>
) {
  const task = await createRoomTask({
    scopeId: scopeOf(params),
    titleAr: String(params.titleAr || params.title || ''),
    notesAr: params.notesAr ? String(params.notesAr) : undefined,
    priority:
      typeof params.priority === 'number' ? params.priority : undefined,
    dueAt: params.dueAt ? String(params.dueAt) : undefined,
    assigneeAr: params.assigneeAr ? String(params.assigneeAr) : undefined,
    assigneeEmail: params.assigneeEmail
      ? String(params.assigneeEmail)
      : undefined,
    source: 'ai',
    createdBy: String(params.userId || 'agent'),
    createdByAr: 'الوكيل',
  })
  return {
    ok: true,
    task,
    messageAr: `أُضيفت «${task.titleAr}» للوحة مهام الغرفة المشتركة.`,
  }
}

export async function executeRoomTasksReconcile(
  _n: string,
  params: Record<string, unknown>
) {
  return reconcileRoomTasks({
    scopeId: scopeOf(params),
    shiftOverdueDays:
      typeof params.shiftOverdueDays === 'number'
        ? params.shiftOverdueDays
        : 1,
  })
}

export async function executeRoomTasksUpdate(
  _n: string,
  params: Record<string, unknown>
) {
  const task = await updateRoomTask(
    String(params.taskId || params.id || ''),
    scopeOf(params),
    {
      titleAr: params.titleAr ? String(params.titleAr) : undefined,
      dueAt: params.dueAt !== undefined ? String(params.dueAt) : undefined,
      status:
        params.status === 'open' ||
        params.status === 'in_progress' ||
        params.status === 'done' ||
        params.status === 'cancelled'
          ? params.status
          : undefined,
      priority:
        typeof params.priority === 'number' ? params.priority : undefined,
      assigneeAr: params.assigneeAr ? String(params.assigneeAr) : undefined,
      sortOrder:
        typeof params.sortOrder === 'number' ? params.sortOrder : undefined,
    }
  )
  return { ok: true, task, messageAr: 'حُدّثت مهمة الغرفة.' }
}

export async function executeRoomMemoryList(
  _n: string,
  params: Record<string, unknown>
) {
  const memories = await listRoomMemories(scopeOf(params))
  return {
    ok: true,
    count: memories.length,
    memories,
    texts: memories.map((m) => m.content),
    messageAr: 'ذاكرة الغرفة المشتركة.',
  }
}

export async function executeRoomMemoryAdd(
  _n: string,
  params: Record<string, unknown>
) {
  const mem = await addRoomMemory({
    scopeId: scopeOf(params),
    content: String(params.content || params.text || ''),
    createdBy: String(params.userId || 'agent'),
    createdByAr: 'الوكيل',
  })
  return { ok: true, memory: mem, messageAr: 'أُضيفت لذاكرة الغرفة.' }
}
