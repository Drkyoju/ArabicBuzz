import { appBaseUrl } from '@/lib/app-url'
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
  updatedByAr?: string
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

  // Best-effort audit row (table may not exist until migration 012)
  void sb.from('room_canvas_audit').insert({
    scope_id: opts.scopeId,
    artifact_id: opts.id,
    title_ar: opts.titleAr,
    actor_id: opts.updatedBy ?? null,
    actor_ar: opts.updatedByAr ?? opts.updatedBy ?? null,
    action: 'update',
  })

  return { ok: true as const }
}

export async function listCanvasAudit(
  scopeId: string,
  limit = 20
): Promise<{
  ok: boolean
  rows: Array<{
    id: string
    artifactId: string
    titleAr: string
    actorAr: string
    at: string
  }>
}> {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false, rows: [] }
  const { data, error } = await sb
    .from('room_canvas_audit')
    .select('*')
    .eq('scope_id', scopeId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) return { ok: false, rows: [] }
  return {
    ok: true,
    rows: data.map((r: Record<string, string>) => ({
      id: r.id,
      artifactId: r.artifact_id,
      titleAr: r.title_ar || '',
      actorAr: r.actor_ar || r.actor_id || '—',
      at: r.created_at,
    })),
  }
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

export type RoomMemberRole = 'owner' | 'editor' | 'member' | 'viewer' | 'guest'

export type RoomMember = {
  id: string
  scopeId: string
  userId: string | null
  email: string | null
  displayNameAr: string
  role: RoomMemberRole
  phone: string | null
  /** finance | programs | board | null */
  committee: string | null
  notesAr: string | null
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
  expiresAt?: string | null
  maxUses?: number
  usedCount?: number
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
        userId: null,
        email: null,
        displayNameAr: 'المالك',
        role: 'owner',
        phone: null,
        committee: 'board',
        notesAr: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'demo-m2',
        scopeId,
        userId: 'user-2',
        email: null,
        displayNameAr: 'سارة',
        role: 'member',
        phone: null,
        committee: 'finance',
        notesAr: 'اللجنة المالية',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'demo-m3',
        scopeId,
        userId: 'user-3',
        email: null,
        displayNameAr: 'فهد',
        role: 'member',
        phone: null,
        committee: 'programs',
        notesAr: null,
        createdAt: new Date().toISOString(),
      },
    ]
  }
  if (scopeId === 'shared-ops') {
    return [
      {
        id: 'demo-o1',
        scopeId,
        userId: null,
        email: null,
        displayNameAr: 'المالك',
        role: 'owner',
        phone: null,
        committee: 'board',
        notesAr: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'demo-o2',
        scopeId,
        userId: 'user-2',
        email: null,
        displayNameAr: 'سارة',
        role: 'member',
        phone: null,
        committee: null,
        notesAr: null,
        createdAt: new Date().toISOString(),
      },
    ]
  }
  return [
    {
      id: `owner-${scopeId}`,
      scopeId,
      userId: null,
      email: null,
      displayNameAr: 'المالك',
      role: 'owner',
      phone: null,
      committee: null,
      notesAr: null,
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
): Promise<RoomMemberRole | null> {
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

/** Demo scopes open to any real signed-in user (Buzz-style starter rooms). */
export const DEMO_OPEN_SCOPES = new Set([
  'shared-demo',
  'shared-ops',
  'personal-demo',
  'personal-research',
])

/** Canvas / content edits: owner, editor, member. */
export async function assertRoomCanEdit(
  scopeId: string,
  userId: string,
  email?: string | null
): Promise<{ ok: true; role: RoomMemberRole | null } | { ok: false; error: string }> {
  const role = await getActorRoomRole(scopeId, userId, email)
  if (role === 'owner' || role === 'editor' || role === 'member') {
    return { ok: true, role }
  }
  if (
    !role &&
    DEMO_OPEN_SCOPES.has(scopeId) &&
    userId &&
    userId !== 'local-owner'
  ) {
    return { ok: true, role: 'member' }
  }
  return {
    ok: false,
    error: 'هذه المساحة للعرض فقط — يلزم دور محرّر أو عضو.',
  }
}

export async function assertRoomCanPost(
  scopeId: string,
  userId: string,
  email?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getActorRoomRole(scopeId, userId, email)
  if (
    role === 'owner' ||
    role === 'editor' ||
    role === 'member' ||
    role === 'guest'
  ) {
    return { ok: true }
  }
  if (
    !role &&
    DEMO_OPEN_SCOPES.has(scopeId) &&
    userId &&
    userId !== 'local-owner'
  ) {
    return { ok: true }
  }
  if (role === 'viewer') {
    return { ok: false, error: 'دور المشاهد لا يسمح بالنشر.' }
  }
  return {
    ok: false,
    error: 'لست عضواً في هذه الغرفة — اطلب دعوة من المالك.',
  }
}

function mapDbMember(r: Record<string, unknown>): RoomMember {
  return {
    id: r.id as string,
    scopeId: r.scope_id as string,
    userId: (r.user_id as string) || null,
    email: (r.email as string) || null,
    displayNameAr: r.display_name_ar as string,
    role: r.role as RoomMember['role'],
    phone: (r.phone as string) || null,
    committee: (r.committee as string) || null,
    notesAr: (r.notes_ar as string) || null,
    createdAt: r.created_at as string,
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
    // Do not seed fake demo members into production tables.
    return { ok: true, members: [], source: 'db' }
  }
  return {
    ok: true,
    source: 'db',
    members: data.map((r) => mapDbMember(r as Record<string, unknown>)),
  }
}

export async function addRoomMember(opts: {
  scopeId: string
  displayNameAr: string
  email?: string | null
  userId?: string | null
  role?: RoomMember['role']
  phone?: string | null
  committee?: string | null
  notesAr?: string | null
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
    phone: opts.phone?.trim() || null,
    committee: opts.committee?.trim() || null,
    notesAr: opts.notesAr?.trim() || null,
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
        phone: member.phone,
        committee: member.committee,
        notes_ar: member.notesAr,
      },
      { onConflict: 'scope_id,email' }
    )
    .select('*')
    .single()

  if (error) {
    // Fallback memory — columns may not exist yet
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
    member: mapDbMember(data as Record<string, unknown>),
  }
}

export async function updateRoomMember(opts: {
  scopeId: string
  memberId: string
  displayNameAr?: string
  email?: string | null
  phone?: string | null
  committee?: string | null
  notesAr?: string | null
  role?: RoomMember['role']
}): Promise<{ ok: boolean; member?: RoomMember; error?: string }> {
  const sb = getSupabaseAdmin()
  const patch: Record<string, unknown> = {}
  if (opts.displayNameAr != null) patch.display_name_ar = opts.displayNameAr.trim()
  if (opts.email !== undefined) patch.email = opts.email?.trim().toLowerCase() || null
  if (opts.phone !== undefined) patch.phone = opts.phone?.trim() || null
  if (opts.committee !== undefined) patch.committee = opts.committee?.trim() || null
  if (opts.notesAr !== undefined) patch.notes_ar = opts.notesAr?.trim() || null
  if (opts.role) patch.role = opts.role

  if (!sb) {
    const list = ensureMemMembers(opts.scopeId)
    const m = list.find((x) => x.id === opts.memberId)
    if (!m) return { ok: false, error: 'العضو غير موجود' }
    if (opts.displayNameAr != null) m.displayNameAr = opts.displayNameAr.trim()
    if (opts.email !== undefined) m.email = opts.email?.trim().toLowerCase() || null
    if (opts.phone !== undefined) m.phone = opts.phone?.trim() || null
    if (opts.committee !== undefined) m.committee = opts.committee?.trim() || null
    if (opts.notesAr !== undefined) m.notesAr = opts.notesAr?.trim() || null
    if (opts.role) m.role = opts.role
    return { ok: true, member: m }
  }

  const { data, error } = await sb
    .from('room_members')
    .update(patch)
    .eq('id', opts.memberId)
    .eq('scope_id', opts.scopeId)
    .select('*')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message || 'تعذّر التحديث' }
  }
  return { ok: true, member: mapDbMember(data as Record<string, unknown>) }
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
  const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString()
  const maxUses = opts.kind === 'link' ? 5 : 1
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
    expiresAt,
    maxUses,
    usedCount: 0,
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
        expires_at: expiresAt,
        max_uses: maxUses,
        used_count: 0,
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

  // Memory-path expiry / use limits
  const memExpires = invite.expiresAt
  if (memExpires && new Date(memExpires).getTime() < Date.now()) {
    return { ok: false, error: 'انتهت صلاحية رابط الدعوة' }
  }
  const memMax = Number(invite.maxUses ?? 1)
  const memUsed = Number(invite.usedCount ?? 0)
  if (invite.status === 'accepted' && memMax <= 1) {
    return { ok: false, error: 'استُخدمت هذه الدعوة مسبقاً' }
  }
  if (memUsed >= memMax) {
    return { ok: false, error: 'استُنفدت استخدامات هذه الدعوة' }
  }

  // Expiry / use limits (from DB columns when present)
  if (sb) {
    const { data: fresh } = await sb
      .from('room_invites')
      .select('expires_at, max_uses, used_count, status')
      .eq('token', opts.token)
      .maybeSingle()
    if (fresh) {
      if (fresh.status === 'revoked') {
        return { ok: false, error: 'أُلغيت هذه الدعوة' }
      }
      if (fresh.expires_at && new Date(fresh.expires_at).getTime() < Date.now()) {
        return { ok: false, error: 'انتهت صلاحية رابط الدعوة' }
      }
      const maxUses = Number(fresh.max_uses ?? 1)
      const used = Number(fresh.used_count ?? 0)
      if (used >= maxUses) {
        return { ok: false, error: 'استُنفدت استخدامات هذه الدعوة' }
      }
    }
  }

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
    const { data: cur } = await sb
      .from('room_invites')
      .select('used_count, max_uses')
      .eq('token', opts.token)
      .maybeSingle()
    const next = Number(cur?.used_count || 0) + 1
    const maxUses = Number(cur?.max_uses || 1)
    await sb
      .from('room_invites')
      .update({
        status: next >= maxUses ? 'accepted' : 'pending',
        accepted_at: new Date().toISOString(),
        accepted_by: opts.userId || name,
        display_name_ar: name,
        used_count: next,
      })
      .eq('token', opts.token)
  } else if (invite) {
    invite.usedCount = Number(invite.usedCount || 0) + 1
    const maxUses = Number(invite.maxUses || 1)
    if (invite.usedCount >= maxUses) invite.status = 'accepted'
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
