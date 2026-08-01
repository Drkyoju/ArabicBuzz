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

export type RoomMember = {
  id: string
  scopeId: string
  userId: string | null
  email: string | null
  displayNameAr: string
  role: 'owner' | 'member' | 'guest'
  createdAt: string
}

export type RoomInvite = {
  id: string
  scopeId: string
  email: string | null
  token: string | null
  status: string
  displayNameAr: string | null
  invitedBy: string | null
  createdAt: string
  inviteUrl?: string
}

/** In-memory fallback when Supabase tables aren't migrated yet. */
const memMembers = new Map<string, RoomMember[]>()
const memInvites = new Map<string, RoomInvite[]>()

function demoSeedMembers(scopeId: string): RoomMember[] {
  if (scopeId === 'shared-demo') {
    return [
      {
        id: 'demo-m1',
        scopeId,
        userId: 'user-1',
        email: 'owner@arabicbuzz.local',
        displayNameAr: 'المالك',
        role: 'owner',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'demo-m2',
        scopeId,
        userId: 'user-2',
        email: 'sara@example.com',
        displayNameAr: 'سارة',
        role: 'member',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'demo-m3',
        scopeId,
        userId: 'user-3',
        email: 'fahad@example.com',
        displayNameAr: 'فهد',
        role: 'member',
        createdAt: new Date().toISOString(),
      },
    ]
  }
  if (scopeId === 'shared-ops') {
    return [
      {
        id: 'demo-o1',
        scopeId,
        userId: 'user-1',
        email: 'owner@arabicbuzz.local',
        displayNameAr: 'المالك',
        role: 'owner',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'demo-o2',
        scopeId,
        userId: 'user-2',
        email: 'sara@example.com',
        displayNameAr: 'سارة',
        role: 'member',
        createdAt: new Date().toISOString(),
      },
    ]
  }
  return [
    {
      id: `owner-${scopeId}`,
      scopeId,
      userId: 'local-owner',
      email: 'owner@arabicbuzz.local',
      displayNameAr: 'المالك',
      role: 'owner',
      createdAt: new Date().toISOString(),
    },
  ]
}

function ensureMemMembers(scopeId: string) {
  if (!memMembers.has(scopeId)) {
    memMembers.set(scopeId, demoSeedMembers(scopeId))
  }
  return memMembers.get(scopeId)!
}

/** Resolve the caller's role in a room (by userId, then email). */
export async function getActorRoomRole(
  scopeId: string,
  userId: string,
  email?: string | null
): Promise<'owner' | 'member' | 'guest' | null> {
  const { members } = await listRoomMembers(scopeId)
  const byUser = members.find((m) => m.userId && m.userId === userId)
  if (byUser) return byUser.role
  if (email) {
    const byEmail = members.find(
      (m) => m.email && m.email.toLowerCase() === email.toLowerCase()
    )
    if (byEmail) return byEmail.role
  }
  return null
}

export async function assertRoomOwner(
  scopeId: string,
  userId: string,
  email?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getActorRoomRole(scopeId, userId, email)
  if (role === 'owner') return { ok: true }
  return {
    ok: false,
    error: 'هذا الإجراء للمالك فقط.',
  }
}

export async function listRoomMembers(scopeId: string): Promise<{
  ok: boolean
  members: RoomMember[]
  source: 'db' | 'memory'
  error?: string
}> {
  const sb = getSupabaseAdmin()
  if (!sb) {
    return { ok: true, members: ensureMemMembers(scopeId), source: 'memory' }
  }
  const { data, error } = await sb
    .from('room_members')
    .select('*')
    .eq('scope_id', scopeId)
    .order('created_at', { ascending: true })
  if (error) {
    // Table may not exist yet
    return {
      ok: true,
      members: ensureMemMembers(scopeId),
      source: 'memory',
      error: error.message,
    }
  }
  if (!data?.length) {
    const seed = demoSeedMembers(scopeId)
    // Seed owner into DB once
    for (const m of seed.filter((x) => x.role === 'owner')) {
      await sb.from('room_members').upsert(
        {
          id: m.id,
          scope_id: m.scopeId,
          user_id: m.userId,
          email: m.email,
          display_name_ar: m.displayNameAr,
          role: m.role,
        },
        { onConflict: 'scope_id,email' }
      )
    }
    const again = await sb
      .from('room_members')
      .select('*')
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: true })
    if (again.data?.length) {
      return {
        ok: true,
        source: 'db',
        members: again.data.map((r) => ({
          id: r.id as string,
          scopeId: r.scope_id as string,
          userId: (r.user_id as string) || null,
          email: (r.email as string) || null,
          displayNameAr: r.display_name_ar as string,
          role: r.role as RoomMember['role'],
          createdAt: r.created_at as string,
        })),
      }
    }
    return { ok: true, members: seed, source: 'memory' }
  }
  return {
    ok: true,
    source: 'db',
    members: data.map((r) => ({
      id: r.id as string,
      scopeId: r.scope_id as string,
      userId: (r.user_id as string) || null,
      email: (r.email as string) || null,
      displayNameAr: r.display_name_ar as string,
      role: r.role as RoomMember['role'],
      createdAt: r.created_at as string,
    })),
  }
}

export async function addRoomMember(opts: {
  scopeId: string
  displayNameAr: string
  email?: string | null
  userId?: string | null
  role?: RoomMember['role']
}): Promise<{ ok: boolean; member?: RoomMember; error?: string }> {
  const name = opts.displayNameAr.trim()
  if (!name) return { ok: false, error: 'الاسم مطلوب' }
  const email = opts.email?.trim().toLowerCase() || null
  const member: RoomMember = {
    id: crypto.randomUUID(),
    scopeId: opts.scopeId,
    userId: opts.userId || null,
    email,
    displayNameAr: name,
    role: opts.role || 'member',
    createdAt: new Date().toISOString(),
  }

  const sb = getSupabaseAdmin()
  if (!sb) {
    const list = ensureMemMembers(opts.scopeId)
    if (email && list.some((m) => m.email === email)) {
      return { ok: false, error: 'هذا البريد موجود مسبقاً في الغرفة' }
    }
    list.push(member)
    return { ok: true, member }
  }

  const { data, error } = await sb
    .from('room_members')
    .upsert(
      {
        id: member.id,
        scope_id: member.scopeId,
        user_id: member.userId,
        email: member.email,
        display_name_ar: member.displayNameAr,
        role: member.role,
      },
      { onConflict: 'scope_id,email' }
    )
    .select('*')
    .single()

  if (error) {
    // Fallback memory
    const list = ensureMemMembers(opts.scopeId)
    list.push(member)
    return { ok: true, member, error: error.message }
  }

  await insertRoomPost({
    scopeId: opts.scopeId,
    authorKind: 'system',
    authorId: 'system',
    authorNameAr: 'النظام',
    content: `انضمّ «${name}» إلى الغرفة${email ? ` (${email})` : ''}.`,
  })

  return {
    ok: true,
    member: {
      id: data.id as string,
      scopeId: data.scope_id as string,
      userId: (data.user_id as string) || null,
      email: (data.email as string) || null,
      displayNameAr: data.display_name_ar as string,
      role: data.role as RoomMember['role'],
      createdAt: data.created_at as string,
    },
  }
}

export async function removeRoomMember(opts: {
  scopeId: string
  memberId: string
}): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin()
  if (!sb) {
    const list = ensureMemMembers(opts.scopeId)
    const idx = list.findIndex((m) => m.id === opts.memberId)
    if (idx < 0) return { ok: false, error: 'العضو غير موجود' }
    if (list[idx].role === 'owner') {
      return { ok: false, error: 'لا يمكن حذف المالك' }
    }
    list.splice(idx, 1)
    return { ok: true }
  }

  const { data: existing } = await sb
    .from('room_members')
    .select('*')
    .eq('id', opts.memberId)
    .eq('scope_id', opts.scopeId)
    .maybeSingle()

  if (!existing) {
    const list = ensureMemMembers(opts.scopeId)
    const idx = list.findIndex((m) => m.id === opts.memberId)
    if (idx >= 0) {
      if (list[idx].role === 'owner') return { ok: false, error: 'لا يمكن حذف المالك' }
      list.splice(idx, 1)
      return { ok: true }
    }
    return { ok: false, error: 'العضو غير موجود' }
  }
  if (existing.role === 'owner') {
    return { ok: false, error: 'لا يمكن حذف المالك' }
  }
  const { error } = await sb
    .from('room_members')
    .delete()
    .eq('id', opts.memberId)
    .eq('scope_id', opts.scopeId)
  if (error) return { ok: false, error: error.message }

  await insertRoomPost({
    scopeId: opts.scopeId,
    authorKind: 'system',
    authorId: 'system',
    authorNameAr: 'النظام',
    content: `أُزيل «${existing.display_name_ar}» من الغرفة.`,
  })
  return { ok: true }
}

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

export async function createRoomInvite(opts: {
  scopeId: string
  email?: string
  invitedBy?: string
  displayNameAr?: string
  kind?: 'email' | 'link'
}) {
  const sb = getSupabaseAdmin()
  const token = crypto.randomUUID().replace(/-/g, '')
  const email =
    opts.kind === 'link'
      ? `link+${token.slice(0, 8)}@invite.local`
      : String(opts.email || '')
          .trim()
          .toLowerCase()
  if (opts.kind !== 'link' && (!email || !email.includes('@'))) {
    return { ok: false as const, error: 'بريد إلكتروني غير صالح' }
  }

  const inviteUrl = `${appBaseUrl()}/invite/${token}?scope=${encodeURIComponent(opts.scopeId)}`
  const invite: RoomInvite = {
    id: crypto.randomUUID(),
    scopeId: opts.scopeId,
    email: opts.kind === 'link' ? null : email,
    token,
    status: 'pending',
    displayNameAr: opts.displayNameAr || null,
    invitedBy: opts.invitedBy || null,
    createdAt: new Date().toISOString(),
    inviteUrl,
  }

  if (!sb) {
    const list = memInvites.get(opts.scopeId) || []
    list.unshift(invite)
    memInvites.set(opts.scopeId, list)
    return { ok: true as const, invite }
  }

  const { data, error } = await sb
    .from('room_invites')
    .upsert(
      {
        id: invite.id,
        scope_id: opts.scopeId,
        email,
        invited_by: opts.invitedBy ?? null,
        status: 'pending',
        token,
        display_name_ar: opts.displayNameAr || null,
      },
      { onConflict: 'scope_id,email' }
    )
    .select('*')
    .single()

  if (error) {
    const list = memInvites.get(opts.scopeId) || []
    list.unshift(invite)
    memInvites.set(opts.scopeId, list)
    return { ok: true as const, invite, warning: error.message }
  }

  return {
    ok: true as const,
    invite: {
      id: data.id as string,
      scopeId: data.scope_id as string,
      email: opts.kind === 'link' ? null : (data.email as string),
      token: (data.token as string) || token,
      status: data.status as string,
      displayNameAr: (data.display_name_ar as string) || null,
      invitedBy: (data.invited_by as string) || null,
      createdAt: data.created_at as string,
      inviteUrl: `${appBaseUrl()}/invite/${(data.token as string) || token}?scope=${encodeURIComponent(opts.scopeId)}`,
    },
  }
}

export async function listRoomInvites(scopeId: string) {
  const sb = getSupabaseAdmin()
  if (!sb) {
    return {
      ok: true as const,
      invites: memInvites.get(scopeId) || [],
    }
  }
  const { data, error } = await sb
    .from('room_invites')
    .select('*')
    .eq('scope_id', scopeId)
    .order('created_at', { ascending: false })
  if (error) {
    return {
      ok: true as const,
      invites: memInvites.get(scopeId) || [],
      error: error.message,
    }
  }
  return {
    ok: true as const,
    invites: (data || []).map((r) => {
      const token = (r.token as string) || null
      return {
        id: r.id as string,
        scopeId: r.scope_id as string,
        email: String(r.email || '').includes('@invite.local')
          ? null
          : (r.email as string),
        token,
        status: r.status as string,
        displayNameAr: (r.display_name_ar as string) || null,
        invitedBy: (r.invited_by as string) || null,
        createdAt: r.created_at as string,
        inviteUrl: token
          ? `${appBaseUrl()}/invite/${token}?scope=${encodeURIComponent(scopeId)}`
          : undefined,
      } satisfies RoomInvite
    }),
  }
}

export async function acceptInviteByToken(opts: {
  token: string
  displayNameAr: string
  userId?: string
}): Promise<{ ok: boolean; scopeId?: string; member?: RoomMember; error?: string }> {
  const name = opts.displayNameAr.trim()
  if (!name) return { ok: false, error: 'اكتب اسمك للانضمام' }

  const sb = getSupabaseAdmin()
  let invite: RoomInvite | null = null

  if (sb) {
    const { data } = await sb
      .from('room_invites')
      .select('*')
      .eq('token', opts.token)
      .maybeSingle()
    if (data) {
      invite = {
        id: data.id as string,
        scopeId: data.scope_id as string,
        email: data.email as string,
        token: data.token as string,
        status: data.status as string,
        displayNameAr: (data.display_name_ar as string) || null,
        invitedBy: (data.invited_by as string) || null,
        createdAt: data.created_at as string,
      }
    }
  }
  if (!invite) {
    for (const [, list] of memInvites) {
      const found = list.find((i) => i.token === opts.token)
      if (found) {
        invite = found
        break
      }
    }
  }
  if (!invite) return { ok: false, error: 'رابط الدعوة غير صالح أو منتهٍ' }
  if (invite.status === 'revoked') return { ok: false, error: 'أُلغيت هذه الدعوة' }

  const email =
    invite.email && !invite.email.includes('@invite.local')
      ? invite.email
      : `guest-${opts.token.slice(0, 8)}@invite.local`

  const added = await addRoomMember({
    scopeId: invite.scopeId,
    displayNameAr: name,
    email,
    userId: opts.userId || null,
    role: 'guest',
  })
  if (!added.ok) return { ok: false, error: added.error }

  if (sb) {
    await sb
      .from('room_invites')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by: opts.userId || name,
        display_name_ar: name,
      })
      .eq('token', opts.token)
  } else if (invite) {
    invite.status = 'accepted'
  }

  return { ok: true, scopeId: invite.scopeId, member: added.member }
}

export async function revokeInvite(opts: {
  scopeId: string
  inviteId: string
}): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin()
  if (!sb) {
    const list = memInvites.get(opts.scopeId) || []
    const inv = list.find((i) => i.id === opts.inviteId)
    if (!inv) return { ok: false, error: 'الدعوة غير موجودة' }
    inv.status = 'revoked'
    return { ok: true }
  }
  const { error } = await sb
    .from('room_invites')
    .update({ status: 'revoked' })
    .eq('id', opts.inviteId)
    .eq('scope_id', opts.scopeId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
