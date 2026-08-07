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
  let assigneeAr = params.assigneeAr ? String(params.assigneeAr) : undefined
  let assigneeEmail = params.assigneeEmail
    ? String(params.assigneeEmail)
    : undefined
  let assigneeUserId = params.assigneeUserId
    ? String(params.assigneeUserId)
    : undefined
  const selfAliases = /^(لي|إلي|انا|أنا|نفسي|لنفسي)$/u
  if (assigneeAr && selfAliases.test(assigneeAr.trim())) {
    const userId = String(params.userId || '')
    try {
      const { listRoomMembers } = await import('@/lib/rooms/persist')
      const { members } = await listRoomMembers(scopeOf(params))
      const hit = members.find((m) => m.userId && m.userId === userId)
      if (hit) {
        assigneeAr = hit.displayNameAr
        assigneeEmail = hit.email || assigneeEmail
        assigneeUserId = hit.userId || userId
      } else {
        assigneeAr = 'أنا'
        assigneeUserId = userId || undefined
      }
    } catch {
      assigneeAr = 'أنا'
      assigneeUserId = userId || undefined
    }
  }
  const task = await createRoomTask({
    scopeId: scopeOf(params),
    titleAr: String(params.titleAr || params.title || ''),
    notesAr: params.notesAr ? String(params.notesAr) : undefined,
    priority:
      typeof params.priority === 'number' ? params.priority : undefined,
    dueAt: params.dueAt ? String(params.dueAt) : undefined,
    assigneeAr,
    assigneeEmail,
    assigneeUserId,
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

/** أرسل لفلان / بلّغ المجموعة — DM إن بدأ البوت، وإلا المجموعة المربوطة. */
export async function executeNotifyRoomMember(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = scopeOf(params)
  const textAr = String(
    params.textAr || params.messageAr || params.text || ''
  ).trim()
  const targetNameAr = String(
    params.targetNameAr || params.memberNameAr || params.toNameAr || ''
  ).trim()
  const fromLabelAr = params.fromLabelAr
    ? String(params.fromLabelAr)
    : undefined

  if (!textAr) throw new Error('يلزم textAr لنص الرسالة.')

  const {
    deliverNamedTelegramMessage,
    deliverGroupBroadcast,
  } = await import('@/lib/telegram/peer-directory')
  const { getSupabaseAdmin } = await import('@/lib/supabase/server')

  let groupChatId =
    params.groupChatId != null ? String(params.groupChatId) : ''
  if (!groupChatId) {
    const sb = getSupabaseAdmin()
    if (sb) {
      const { data } = await sb
        .from('channel_bindings')
        .select('external_id')
        .eq('channel', 'telegram')
        .eq('scope_id', scopeId)
        .order('created_at', { ascending: false })
        .limit(20)
      const group = (data || []).find((r) =>
        String(r.external_id || '').startsWith('-')
      )
      if (group?.external_id) groupChatId = String(group.external_id)
    }
  }

  const broadcastAliases =
    /^(المجموعة|القروب|الفريق|الأعضاء|الاعضاء|الجميع|all|team|group)$/iu
  if (!targetNameAr || broadcastAliases.test(targetNameAr)) {
    if (!groupChatId) {
      return {
        ok: false,
        via: 'none',
        messageAr:
          'لا مجموعة مربوطة بهذه الغرفة. اربط بـ /link داخل المجموعة أولاً.',
        limitsAr:
          'البوت يبلّغ المجموعة المربوطة أو خاص من بدأ Start — لا يخترع وصولاً.',
      }
    }
    return deliverGroupBroadcast({
      scopeId,
      textAr,
      groupChatId,
      fromLabelAr,
    })
  }

  return deliverNamedTelegramMessage({
    scopeId,
    targetNameAr,
    textAr,
    groupChatId: groupChatId || null,
    fromLabelAr,
  })
}
