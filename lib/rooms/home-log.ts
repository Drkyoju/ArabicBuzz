/**
 * Persist room home dashboard history (edits, presence, Zoom).
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export type ActivityKind =
  | 'edit'
  | 'message'
  | 'canvas'
  | 'presence'
  | 'zoom'
  | 'system'

export type ActivityRow = {
  id: string
  scopeId: string
  kind: ActivityKind
  actorAr: string
  actorEmail: string | null
  actionAr: string
  detailAr: string | null
  createdAt: string
}

export type ZoomSessionRow = {
  id: string
  scopeId: string
  meetingId: string
  topic: string | null
  joinUrl: string | null
  hostEmail: string | null
  startedAt: string
  lastSeenAt: string
  endedAt: string | null
  live: boolean
}

const memActivity: ActivityRow[] = []
const memZoom: ZoomSessionRow[] = []

export async function logRoomActivity(opts: {
  scopeId: string
  kind?: ActivityKind
  actorAr: string
  actorEmail?: string | null
  actionAr: string
  detailAr?: string | null
}): Promise<ActivityRow> {
  const row: ActivityRow = {
    id: randomUUID(),
    scopeId: opts.scopeId,
    kind: opts.kind || 'edit',
    actorAr: opts.actorAr.slice(0, 120) || 'عضو',
    actorEmail: opts.actorEmail || null,
    actionAr: opts.actionAr.slice(0, 200),
    detailAr: opts.detailAr?.slice(0, 500) || null,
    createdAt: new Date().toISOString(),
  }
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('room_activity_log')
      .insert({
        id: row.id,
        scope_id: row.scopeId,
        kind: row.kind,
        actor_ar: row.actorAr,
        actor_email: row.actorEmail,
        action_ar: row.actionAr,
        detail_ar: row.detailAr,
      })
      .select('*')
      .single()
    if (!error && data) {
      return {
        id: String((data as { id: string }).id),
        scopeId: String((data as { scope_id: string }).scope_id),
        kind: ((data as { kind: ActivityKind }).kind || 'edit') as ActivityKind,
        actorAr: String((data as { actor_ar: string }).actor_ar),
        actorEmail: (data as { actor_email?: string }).actor_email || null,
        actionAr: String((data as { action_ar: string }).action_ar),
        detailAr: (data as { detail_ar?: string }).detail_ar || null,
        createdAt: String((data as { created_at: string }).created_at),
      }
    }
  }
  memActivity.unshift(row)
  if (memActivity.length > 500) memActivity.length = 500
  return row
}

export async function listRoomActivity(
  scopeId: string,
  limit = 40
): Promise<ActivityRow[]> {
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('room_activity_log')
      .select('*')
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (!error && data) {
      return (data as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        scopeId: String(r.scope_id),
        kind: (r.kind as ActivityKind) || 'edit',
        actorAr: String(r.actor_ar),
        actorEmail: r.actor_email ? String(r.actor_email) : null,
        actionAr: String(r.action_ar),
        detailAr: r.detail_ar ? String(r.detail_ar) : null,
        createdAt: String(r.created_at),
      }))
    }
  }
  return memActivity.filter((a) => a.scopeId === scopeId).slice(0, limit)
}

export async function upsertZoomLiveSessions(opts: {
  scopeId: string
  meetings: Array<{
    id: string
    topic?: string
    joinUrl?: string | null
    hostEmail?: string | null
    live: boolean
  }>
}): Promise<void> {
  const sb = getSupabaseAdmin()
  const now = new Date().toISOString()
  const liveIds = new Set(
    opts.meetings.filter((m) => m.live && m.id).map((m) => m.id)
  )

  for (const m of opts.meetings.filter((x) => x.live && x.id)) {
    if (sb) {
      const { data: existing } = await sb
        .from('zoom_session_log')
        .select('*')
        .eq('scope_id', opts.scopeId)
        .eq('meeting_id', m.id)
        .eq('live', true)
        .maybeSingle()
      if (existing) {
        await sb
          .from('zoom_session_log')
          .update({
            last_seen_at: now,
            topic: m.topic || (existing as { topic?: string }).topic,
            join_url: m.joinUrl || (existing as { join_url?: string }).join_url,
          })
          .eq('id', (existing as { id: string }).id)
      } else {
        await sb.from('zoom_session_log').insert({
          id: randomUUID(),
          scope_id: opts.scopeId,
          meeting_id: m.id,
          topic: m.topic || null,
          join_url: m.joinUrl || null,
          host_email: m.hostEmail || null,
          started_at: now,
          last_seen_at: now,
          live: true,
        })
        await logRoomActivity({
          scopeId: opts.scopeId,
          kind: 'zoom',
          actorAr: m.hostEmail || 'Zoom',
          actionAr: 'بدأت جلسة Zoom',
          detailAr: m.topic || m.id,
        })
      }
    } else {
      const hit = memZoom.find(
        (z) => z.scopeId === opts.scopeId && z.meetingId === m.id && z.live
      )
      if (hit) {
        hit.lastSeenAt = now
        hit.topic = m.topic || hit.topic
      } else {
        memZoom.unshift({
          id: randomUUID(),
          scopeId: opts.scopeId,
          meetingId: m.id,
          topic: m.topic || null,
          joinUrl: m.joinUrl || null,
          hostEmail: m.hostEmail || null,
          startedAt: now,
          lastSeenAt: now,
          endedAt: null,
          live: true,
        })
      }
    }
  }

  // Close sessions no longer live
  if (sb) {
    const { data: open } = await sb
      .from('zoom_session_log')
      .select('*')
      .eq('scope_id', opts.scopeId)
      .eq('live', true)
    for (const row of open || []) {
      const mid = String((row as { meeting_id: string }).meeting_id)
      if (!liveIds.has(mid)) {
        await sb
          .from('zoom_session_log')
          .update({ live: false, ended_at: now, last_seen_at: now })
          .eq('id', (row as { id: string }).id)
        await logRoomActivity({
          scopeId: opts.scopeId,
          kind: 'zoom',
          actorAr: 'Zoom',
          actionAr: 'انتهت جلسة Zoom',
          detailAr: String((row as { topic?: string }).topic || mid),
        })
      }
    }
  } else {
    for (const z of memZoom) {
      if (
        z.scopeId === opts.scopeId &&
        z.live &&
        !liveIds.has(z.meetingId)
      ) {
        z.live = false
        z.endedAt = now
        z.lastSeenAt = now
      }
    }
  }
}

export async function listZoomSessions(
  scopeId: string,
  limit = 20
): Promise<ZoomSessionRow[]> {
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('zoom_session_log')
      .select('*')
      .eq('scope_id', scopeId)
      .order('last_seen_at', { ascending: false })
      .limit(limit)
    if (!error && data) {
      return (data as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        scopeId: String(r.scope_id),
        meetingId: String(r.meeting_id),
        topic: r.topic ? String(r.topic) : null,
        joinUrl: r.join_url ? String(r.join_url) : null,
        hostEmail: r.host_email ? String(r.host_email) : null,
        startedAt: String(r.started_at),
        lastSeenAt: String(r.last_seen_at),
        endedAt: r.ended_at ? String(r.ended_at) : null,
        live: Boolean(r.live),
      }))
    }
  }
  return memZoom.filter((z) => z.scopeId === scopeId).slice(0, limit)
}

export async function lastZoomLiveAt(
  scopeId: string
): Promise<string | null> {
  const rows = await listZoomSessions(scopeId, 5)
  const live = rows.find((r) => r.live)
  if (live) return live.lastSeenAt
  const ended = rows.find((r) => r.endedAt || r.lastSeenAt)
  return ended?.lastSeenAt || ended?.endedAt || null
}
