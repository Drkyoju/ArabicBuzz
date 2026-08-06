import { getSupabaseAdmin } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export type TaskComment = {
  id: string
  taskId: string
  scopeId: string
  authorId: string | null
  authorAr: string
  bodyAr: string
  createdAt: string
}

type DbRow = Record<string, unknown>
const mem = new Map<string, TaskComment[]>()

function rowToComment(r: DbRow): TaskComment {
  return {
    id: String(r.id),
    taskId: String(r.task_id),
    scopeId: String(r.scope_id),
    authorId: r.author_id != null ? String(r.author_id) : null,
    authorAr: String(r.author_ar || 'عضو'),
    bodyAr: String(r.body_ar || ''),
    createdAt: String(r.created_at),
  }
}

export async function listTaskComments(
  taskId: string,
  scopeId: string
): Promise<TaskComment[]> {
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('room_task_comments')
      .select('*')
      .eq('task_id', taskId)
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: true })
      .limit(100)
    if (!error && data) return (data as DbRow[]).map(rowToComment)
  }
  return (mem.get(`${scopeId}:${taskId}`) || []).slice()
}

export async function addTaskComment(opts: {
  taskId: string
  scopeId: string
  bodyAr: string
  authorId?: string
  authorAr: string
}): Promise<TaskComment> {
  const bodyAr = opts.bodyAr.trim()
  if (!bodyAr) throw new Error('نص التعليق مطلوب')
  if (bodyAr.length > 500) throw new Error('التعليق طويل جداً (حد ٥٠٠ حرف)')
  const now = new Date().toISOString()
  const comment: TaskComment = {
    id: randomUUID(),
    taskId: opts.taskId,
    scopeId: opts.scopeId,
    authorId: opts.authorId || null,
    authorAr: opts.authorAr.trim() || 'عضو',
    bodyAr,
    createdAt: now,
  }
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('room_task_comments')
      .insert({
        id: comment.id,
        task_id: comment.taskId,
        scope_id: comment.scopeId,
        author_id: comment.authorId,
        author_ar: comment.authorAr,
        body_ar: comment.bodyAr,
      })
      .select('*')
      .single()
    if (!error && data) return rowToComment(data as DbRow)
    if (error) throw new Error(error.message)
  }
  const key = `${opts.scopeId}:${opts.taskId}`
  const list = mem.get(key) || []
  list.push(comment)
  mem.set(key, list)
  return comment
}
