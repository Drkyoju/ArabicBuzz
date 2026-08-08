/**
 * Shared room tasks / orders board — AI can reorder, reschedule, reassign.
 * Belongs to the room (scopeId), not one person's email or Google account.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export type RoomTaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled'
export type RoomTask = {
  id: string
  scopeId: string
  titleAr: string
  notesAr: string | null
  status: RoomTaskStatus
  priority: number
  dueAt: string | null
  assigneeAr: string | null
  assigneeEmail: string | null
  assigneeUserId: string | null
  sortOrder: number
  source: 'manual' | 'ai' | 'email' | 'chat'
  createdBy: string | null
  createdByAr: string | null
  createdAt: string
  updatedAt: string
}

type DbRow = Record<string, unknown>
const mem = new Map<string, RoomTask>()

function rowToTask(r: DbRow): RoomTask {
  return {
    id: String(r.id),
    scopeId: String(r.scope_id),
    titleAr: String(r.title_ar),
    notesAr: r.notes_ar != null ? String(r.notes_ar) : null,
    status: (r.status as RoomTaskStatus) || 'open',
    priority: Number(r.priority ?? 2),
    dueAt: r.due_at != null ? String(r.due_at) : null,
    assigneeAr: r.assignee_ar != null ? String(r.assignee_ar) : null,
    assigneeEmail: r.assignee_email != null ? String(r.assignee_email) : null,
    assigneeUserId:
      r.assignee_user_id != null ? String(r.assignee_user_id) : null,
    sortOrder: Number(r.sort_order ?? 0),
    source: (r.source as RoomTask['source']) || 'manual',
    createdBy: r.created_by != null ? String(r.created_by) : null,
    createdByAr: r.created_by_ar != null ? String(r.created_by_ar) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

/** Open / in-progress — shared by inbox, home digest, and calendar «المهام». */
export function isOpenRoomTask(t: Pick<RoomTask, 'status'>): boolean {
  return t.status === 'open' || t.status === 'in_progress'
}

/**
 * Whether a room task is assigned to this user.
 * Match by userId, email, or display name (normalized) so وارد الفريق
 * and لوحة المهام stay aligned.
 */
export function isRoomTaskAssignedToMe(
  t: Pick<RoomTask, 'assigneeUserId' | 'assigneeEmail' | 'assigneeAr'>,
  me: { userId?: string | null; email?: string | null; nameAr?: string | null }
): boolean {
  const userId = me.userId?.trim() || ''
  if (userId && t.assigneeUserId && t.assigneeUserId === userId) return true
  const email = me.email?.trim().toLowerCase() || ''
  if (email && t.assigneeEmail && t.assigneeEmail.toLowerCase() === email)
    return true
  const nameAr = me.nameAr?.trim() || ''
  if (
    nameAr &&
    t.assigneeAr &&
    (t.assigneeAr === nameAr ||
      t.assigneeAr.replace(/\s+/g, '') === nameAr.replace(/\s+/g, ''))
  ) {
    return true
  }
  return false
}

export function filterMyOpenRoomTasks(
  tasks: RoomTask[],
  me: { userId?: string | null; email?: string | null; nameAr?: string | null }
): RoomTask[] {
  return tasks.filter(
    (t) => isOpenRoomTask(t) && isRoomTaskAssignedToMe(t, me)
  )
}

export async function listRoomTasks(
  scopeId: string,
  opts?: { includeDone?: boolean }
): Promise<RoomTask[]> {
  const sb = getSupabaseAdmin()
  if (sb) {
    let q = sb
      .from('room_tasks')
      .select('*')
      .eq('scope_id', scopeId)
      .order('sort_order', { ascending: true })
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(200)
    if (!opts?.includeDone) q = q.neq('status', 'cancelled')
    const { data, error } = await q
    if (!error && data) return (data as DbRow[]).map(rowToTask)
  }
  return [...mem.values()]
    .filter((t) => t.scopeId === scopeId)
    .filter((t) => opts?.includeDone || t.status !== 'cancelled')
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.dueAt || '').localeCompare(b.dueAt || ''))
}

export async function createRoomTask(opts: {
  scopeId: string
  titleAr: string
  notesAr?: string
  priority?: number
  dueAt?: string
  assigneeAr?: string
  assigneeEmail?: string
  assigneeUserId?: string
  source?: RoomTask['source']
  createdBy?: string
  createdByAr?: string
}): Promise<RoomTask> {
  const titleAr = opts.titleAr.trim()
  if (!titleAr) throw new Error('عنوان المهمة مطلوب')
  const existing = await listRoomTasks(opts.scopeId, { includeDone: true })
  const sortOrder =
    existing.reduce((m, t) => Math.max(m, t.sortOrder), 0) + 10
  const now = new Date().toISOString()
  const task: RoomTask = {
    id: randomUUID(),
    scopeId: opts.scopeId,
    titleAr,
    notesAr: opts.notesAr?.trim() || null,
    status: 'open',
    priority: Math.min(5, Math.max(1, opts.priority ?? 2)),
    dueAt: opts.dueAt ? new Date(opts.dueAt).toISOString() : null,
    assigneeAr: opts.assigneeAr?.trim() || null,
    assigneeEmail: opts.assigneeEmail?.trim() || null,
    assigneeUserId: opts.assigneeUserId?.trim() || null,
    sortOrder,
    source: opts.source || 'manual',
    createdBy: opts.createdBy || null,
    createdByAr: opts.createdByAr || null,
    createdAt: now,
    updatedAt: now,
  }
  const sb = getSupabaseAdmin()
  if (sb) {
    const row: Record<string, unknown> = {
      id: task.id,
      scope_id: task.scopeId,
      title_ar: task.titleAr,
      notes_ar: task.notesAr,
      status: task.status,
      priority: task.priority,
      due_at: task.dueAt,
      assignee_ar: task.assigneeAr,
      assignee_email: task.assigneeEmail,
      sort_order: task.sortOrder,
      source: task.source,
      created_by: task.createdBy,
      created_by_ar: task.createdByAr,
    }
    if (task.assigneeUserId) row.assignee_user_id = task.assigneeUserId
    const { data, error } = await sb
      .from('room_tasks')
      .insert(row)
      .select('*')
      .single()
    if (!error && data) return rowToTask(data as DbRow)
  }
  mem.set(task.id, task)
  return task
}

export async function updateRoomTask(
  id: string,
  scopeId: string,
  patch: Partial<{
    titleAr: string
    notesAr: string | null
    status: RoomTaskStatus
    priority: number
    dueAt: string | null
    assigneeAr: string | null
    assigneeEmail: string | null
    assigneeUserId: string | null
    sortOrder: number
  }>
): Promise<RoomTask> {
  const list = await listRoomTasks(scopeId, { includeDone: true })
  const cur = list.find((t) => t.id === id)
  if (!cur) throw new Error('المهمة غير موجودة في لوحة الغرفة')
  const next: RoomTask = {
    ...cur,
    titleAr: patch.titleAr?.trim() || cur.titleAr,
    notesAr: patch.notesAr !== undefined ? patch.notesAr : cur.notesAr,
    status: patch.status || cur.status,
    priority: patch.priority ?? cur.priority,
    dueAt:
      patch.dueAt !== undefined
        ? patch.dueAt
          ? new Date(patch.dueAt).toISOString()
          : null
        : cur.dueAt,
    assigneeAr:
      patch.assigneeAr !== undefined ? patch.assigneeAr : cur.assigneeAr,
    assigneeEmail:
      patch.assigneeEmail !== undefined
        ? patch.assigneeEmail
        : cur.assigneeEmail,
    assigneeUserId:
      patch.assigneeUserId !== undefined
        ? patch.assigneeUserId
        : cur.assigneeUserId,
    sortOrder: patch.sortOrder ?? cur.sortOrder,
    updatedAt: new Date().toISOString(),
  }
  const sb = getSupabaseAdmin()
  if (sb) {
    const updateRow: Record<string, unknown> = {
      title_ar: next.titleAr,
      notes_ar: next.notesAr,
      status: next.status,
      priority: next.priority,
      due_at: next.dueAt,
      assignee_ar: next.assigneeAr,
      assignee_email: next.assigneeEmail,
      sort_order: next.sortOrder,
      updated_at: next.updatedAt,
    }
    if (patch.assigneeUserId !== undefined) {
      updateRow.assignee_user_id = next.assigneeUserId
    }
    const { data, error } = await sb
      .from('room_tasks')
      .update(updateRow)
      .eq('id', id)
      .eq('scope_id', scopeId)
      .select('*')
      .single()
    if (!error && data) return rowToTask(data as DbRow)
  }
  mem.set(id, next)
  return next
}

/** AI: reorder by priority then due date, optionally shift overdue due dates. */
export async function reconcileRoomTasks(opts: {
  scopeId: string
  shiftOverdueDays?: number
}): Promise<{ tasks: RoomTask[]; messageAr: string; adjusted: number }> {
  const open = (await listRoomTasks(opts.scopeId)).filter(isOpenRoomTask)
  const now = Date.now()
  let adjusted = 0
  const shiftDays = opts.shiftOverdueDays ?? 1

  // Sort: priority asc (1=highest), then due date
  const sorted = [...open].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return (a.dueAt || '9999').localeCompare(b.dueAt || '9999')
  })

  const updated: RoomTask[] = []
  for (let i = 0; i < sorted.length; i++) {
    let t = sorted[i]
    const patch: Parameters<typeof updateRoomTask>[2] = {
      sortOrder: (i + 1) * 10,
    }
    if (t.dueAt && new Date(t.dueAt).getTime() < now && t.status !== 'done') {
      const d = new Date()
      d.setDate(d.getDate() + shiftDays)
      d.setHours(10, 0, 0, 0)
      patch.dueAt = d.toISOString()
      adjusted += 1
    }
    t = await updateRoomTask(t.id, opts.scopeId, patch)
    updated.push(t)
  }

  return {
    tasks: updated,
    adjusted,
    messageAr:
      adjusted > 0
        ? `أُعيد ترتيب ${updated.length} مهمة وعُدّل موعد ${adjusted} متأخرة.`
        : `أُعيد ترتيب ${updated.length} مهمة حسب الأولوية والتاريخ.`,
  }
}
