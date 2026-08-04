/**
 * Shared room memory — scope-owned, not one person's browser.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export type RoomMemory = {
  id: string
  scopeId: string
  content: string
  createdBy: string | null
  createdByAr: string | null
  createdAt: string
}

const memory = new Map<string, RoomMemory>()

export async function listRoomMemories(scopeId: string): Promise<RoomMemory[]> {
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('room_memories')
      .select('*')
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (!error && data) {
      return (data as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        scopeId: String(r.scope_id),
        content: String(r.content),
        createdBy: r.created_by ? String(r.created_by) : null,
        createdByAr: r.created_by_ar ? String(r.created_by_ar) : null,
        createdAt: String(r.created_at),
      }))
    }
  }
  return [...memory.values()]
    .filter((m) => m.scopeId === scopeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function addRoomMemory(opts: {
  scopeId: string
  content: string
  createdBy?: string
  createdByAr?: string
}): Promise<RoomMemory> {
  const content = opts.content.trim()
  if (!content) throw new Error('نص الذاكرة مطلوب')
  const row: RoomMemory = {
    id: randomUUID(),
    scopeId: opts.scopeId,
    content,
    createdBy: opts.createdBy || null,
    createdByAr: opts.createdByAr || null,
    createdAt: new Date().toISOString(),
  }
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('room_memories')
      .insert({
        id: row.id,
        scope_id: row.scopeId,
        content: row.content,
        created_by: row.createdBy,
        created_by_ar: row.createdByAr,
      })
      .select('*')
      .single()
    if (!error && data) {
      return {
        id: String((data as { id: string }).id),
        scopeId: String((data as { scope_id: string }).scope_id),
        content: String((data as { content: string }).content),
        createdBy: (data as { created_by?: string }).created_by || null,
        createdByAr: (data as { created_by_ar?: string }).created_by_ar || null,
        createdAt: String((data as { created_at: string }).created_at),
      }
    }
  }
  memory.set(row.id, row)
  return row
}

export async function removeRoomMemory(id: string, scopeId: string) {
  const sb = getSupabaseAdmin()
  if (sb) {
    await sb.from('room_memories').delete().eq('id', id).eq('scope_id', scopeId)
  }
  memory.delete(id)
  return { ok: true }
}
