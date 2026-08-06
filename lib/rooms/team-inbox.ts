/**
 * Aggregate «وارد الفريق» for the current user + room.
 */
import { listPendingApprovals } from '@/lib/agents/resolve-approval'
import { listRoomCalendarEvents } from '@/lib/rooms/room-calendar'
import { listRoomInvites, listRoomMembers } from '@/lib/rooms/persist'
import { listRoomTasks } from '@/lib/rooms/room-tasks'
import { isHitlDisabled } from '@/lib/security/posture'
import { getSupabaseAdmin } from '@/lib/supabase/server'

const TZ = 'Asia/Riyadh'

export type TeamInboxItem = {
  id: string
  kind: 'task' | 'invite' | 'event' | 'hitl'
  titleAr: string
  detailAr?: string | null
  whenAt?: string | null
  whenAtAr?: string | null
  hrefHint?: string
}

function fmtTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: TZ,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

async function listPendingInvitesForEmail(email: string) {
  const sb = getSupabaseAdmin()
  if (!sb) return []
  const { data, error } = await sb
    .from('room_invites')
    .select('*')
    .eq('status', 'pending')
    .ilike('email', email)
    .limit(20)
  if (error || !data) return []
  return data.map((r) => ({
    id: String(r.id),
    scopeId: String(r.scope_id),
    email: String(r.email || ''),
    displayNameAr: (r.display_name_ar as string) || null,
    token: (r.token as string) || null,
    createdAt: String(r.created_at),
  }))
}

export async function buildTeamInbox(opts: {
  scopeId: string
  userId: string
  email?: string | null
  displayNameAr?: string | null
}): Promise<{ items: TeamInboxItem[]; count: number }> {
  const now = Date.now()
  const in24h = now + 24 * 60 * 60 * 1000
  const email = opts.email?.trim().toLowerCase() || ''
  const nameAr = opts.displayNameAr?.trim() || ''

  const [tasks, events, membersRes, invitesMine, pending] = await Promise.all([
    listRoomTasks(opts.scopeId).catch(() => []),
    listRoomCalendarEvents({
      scopeId: opts.scopeId,
      from: new Date(now - 60_000).toISOString(),
      to: new Date(in24h).toISOString(),
    }).catch(() => []),
    listRoomMembers(opts.scopeId).catch(() => ({
      ok: false,
      members: [],
      source: 'memory' as const,
    })),
    email ? listPendingInvitesForEmail(email).catch(() => []) : Promise.resolve([]),
    isHitlDisabled()
      ? Promise.resolve([])
      : listPendingApprovals().catch(() => []),
  ])

  const items: TeamInboxItem[] = []

  // My open tasks (assignee match by email, userId, or display name)
  const myOpen = tasks.filter((t) => {
    if (t.status !== 'open' && t.status !== 'in_progress') return false
    if (t.assigneeEmail && email && t.assigneeEmail.toLowerCase() === email)
      return true
    if (
      nameAr &&
      t.assigneeAr &&
      (t.assigneeAr === nameAr ||
        t.assigneeAr.replace(/\s+/g, '') === nameAr.replace(/\s+/g, ''))
    )
      return true
    // Also surface unassigned? No — only mine
    return false
  })
  for (const t of myOpen.slice(0, 8)) {
    items.push({
      id: `task-${t.id}`,
      kind: 'task',
      titleAr: t.titleAr,
      detailAr: t.status === 'in_progress' ? 'قيد التنفيذ' : 'مهمة مفتوحة',
      whenAt: t.dueAt,
      whenAtAr: t.dueAt ? fmtTime(t.dueAt) : 'بدون موعد',
      hrefHint: 'calendar:tasks',
    })
  }

  // Pending invites for my email (any room)
  for (const inv of invitesMine.slice(0, 5)) {
    items.push({
      id: `invite-${inv.id}`,
      kind: 'invite',
      titleAr: `دعوة للانضمام إلى «${inv.scopeId}»`,
      detailAr: inv.displayNameAr || inv.email,
      whenAt: inv.createdAt,
      whenAtAr: fmtTime(inv.createdAt),
      hrefHint: inv.token ? `invite/${inv.token}` : 'team',
    })
  }

  // Also pending invites in this room addressed to me (from listRoomInvites)
  try {
    const { invites } = await listRoomInvites(opts.scopeId)
    for (const inv of invites) {
      if (inv.status !== 'pending') continue
      if (!email || !inv.email || inv.email.toLowerCase() !== email) continue
      if (items.some((i) => i.id === `invite-${inv.id}`)) continue
      items.push({
        id: `invite-${inv.id}`,
        kind: 'invite',
        titleAr: 'دعوة معلّقة لهذه الغرفة',
        detailAr: inv.displayNameAr || inv.email,
        whenAt: inv.createdAt,
        whenAtAr: fmtTime(inv.createdAt),
        hrefHint: 'team',
      })
    }
  } catch {
    /* ignore */
  }

  // Upcoming room events in 24h
  for (const e of events.slice(0, 8)) {
    const t = new Date(e.startsAt).getTime()
    if (t < now || t > in24h) continue
    items.push({
      id: `event-${e.id}`,
      kind: 'event',
      titleAr: e.titleAr,
      detailAr: e.locationAr,
      whenAt: e.startsAt,
      whenAtAr: fmtTime(e.startsAt),
      hrefHint: 'calendar',
    })
  }

  // Pending HITL (when enabled)
  if (!isHitlDisabled()) {
    const scoped = pending.filter(
      (p) => !p.scopeId || p.scopeId === opts.scopeId
    )
    for (const p of scoped.slice(0, 6)) {
      items.push({
        id: `hitl-${p.approvalId || p.id}`,
        kind: 'hitl',
        titleAr: `موافقة: ${p.actionName}`,
        detailAr: p.riskLevel === 'HIGH' ? 'خطر عالي' : 'خطر منخفض',
        hrefHint: 'approvals',
      })
    }
  }

  void membersRes // reserved for future personalization

  return { items: items.slice(0, 24), count: items.length }
}
