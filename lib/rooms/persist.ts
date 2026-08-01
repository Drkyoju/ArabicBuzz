import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { RoomPost } from '@/lib/scopes/types'

export type DbRoomPost = {
  id: string
  scope_id: string
  author_kind: string
  author_id: string
  author_name_ar: string
  content: string
  mention_agent_id: string | null
  channel: string | null
  external_id: string | null
  created_at: string
}

export function rowToRoomPost(row: DbRoomPost): RoomPost {
  const kind =
    row.author_kind === 'agent'
      ? 'agent'
      : row.author_kind === 'system'
        ? 'system'
        : row.author_kind === 'channel'
          ? 'channel'
          : 'human'
  return {
    id: row.id,
    scopeId: row.scope_id,
    authorKind: kind,
    authorId: row.author_id,
    authorNameAr: row.author_name_ar,
    content: row.content,
    createdAt: new Date(row.created_at).getTime(),
  }
}

export async function listRoomPosts(scopeId: string, limit = 100) {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false as const, posts: [] as RoomPost[], error: 'no supabase' }
  const { data, error } = await sb
    .from('room_posts')
    .select('*')
    .eq('scope_id', scopeId)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) return { ok: false as const, posts: [] as RoomPost[], error: error.message }
  return {
    ok: true as const,
    posts: (data as DbRoomPost[]).map(rowToRoomPost),
  }
}

export async function insertRoomPost(opts: {
  id?: string
  scopeId: string
  authorKind: 'human' | 'agent' | 'system' | 'channel'
  authorId: string
  authorNameAr: string
  content: string
  mentionAgentId?: string
  channel?: string
  externalId?: string
}): Promise<{ ok: boolean; post?: RoomPost; error?: string }> {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false, error: 'no supabase' }
  const id = opts.id || crypto.randomUUID()
  const { data, error } = await sb
    .from('room_posts')
    .insert({
      id,
      scope_id: opts.scopeId,
      author_kind: opts.authorKind,
      author_id: opts.authorId,
      author_name_ar: opts.authorNameAr,
      content: opts.content,
      mention_agent_id: opts.mentionAgentId ?? null,
      channel: opts.channel ?? null,
      external_id: opts.externalId ?? null,
    })
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, post: rowToRoomPost(data as DbRoomPost) }
}

export async function upsertCanvasArtifact(opts: {
  id: string
  scopeId: string
  type: string
  titleAr: string
  content: string
  language?: string
  updatedBy?: string
}) {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false as const, error: 'no supabase' }
  const { error } = await sb.from('room_canvas_artifacts').upsert({
    id: opts.id,
    scope_id: opts.scopeId,
    type: opts.type,
    title_ar: opts.titleAr,
    content: opts.content,
    language: opts.language ?? null,
    updated_by: opts.updatedBy ?? null,
    updated_at: new Date().toISOString(),
  })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export async function listCanvasArtifacts(scopeId: string) {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false as const, rows: [], error: 'no supabase' }
  const { data, error } = await sb
    .from('room_canvas_artifacts')
    .select('*')
    .eq('scope_id', scopeId)
    .order('updated_at', { ascending: false })
  if (error) return { ok: false as const, rows: [], error: error.message }
  return { ok: true as const, rows: data || [] }
}

export async function createRoomInvite(opts: {
  scopeId: string
  email: string
  invitedBy?: string
}) {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false as const, error: 'no supabase' }
  const email = opts.email.trim().toLowerCase()
  const { data, error } = await sb
    .from('room_invites')
    .upsert(
      {
        scope_id: opts.scopeId,
        email,
        invited_by: opts.invitedBy ?? null,
        status: 'pending',
      },
      { onConflict: 'scope_id,email' }
    )
    .select('*')
    .single()
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, invite: data }
}

export async function listRoomInvites(scopeId: string) {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false as const, invites: [], error: 'no supabase' }
  const { data, error } = await sb
    .from('room_invites')
    .select('*')
    .eq('scope_id', scopeId)
    .order('created_at', { ascending: false })
  if (error) return { ok: false as const, invites: [], error: error.message }
  return { ok: true as const, invites: data || [] }
}
