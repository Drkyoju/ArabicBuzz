import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** Server-side Supabase client (Netlify env: SUPABASE_URL + key). */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

export type ApprovalStatusRow = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'

export type PendingApprovalRow = {
  id: string
  action_name: string
  params: Record<string, unknown>
  risk_level: 'LOW' | 'HIGH'
  status: ApprovalStatusRow
  requester_id: string
  thread_id?: string | null
  scope_id?: string | null
}

/** Insert pending HITL row so Telegram/webhooks on other Netlify instances can resolve it. */
export async function insertPendingApprovalInSupabase(opts: {
  id: string
  actionName: string
  params: Record<string, unknown>
  riskLevel: 'LOW' | 'HIGH'
  requesterId: string
  threadId?: string
  scopeId?: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { ok: false, error: 'SUPABASE_URL / key missing' }
  }
  const { error } = await supabase.from('pending_approvals').upsert({
    id: opts.id,
    action_name: opts.actionName,
    params: opts.params,
    risk_level: opts.riskLevel,
    status: 'PENDING_APPROVAL',
    requester_id: opts.requesterId,
    thread_id: opts.threadId ?? null,
    scope_id: opts.scopeId ?? null,
    created_at: new Date().toISOString(),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getPendingApprovalFromSupabase(
  approvalId: string
): Promise<PendingApprovalRow | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('pending_approvals')
    .select(
      'id, action_name, params, risk_level, status, requester_id, thread_id, scope_id'
    )
    .eq('id', approvalId)
    .maybeSingle()
  if (error || !data) return null
  return data as PendingApprovalRow
}

export async function listPendingApprovalsFromSupabase(
  limit = 50
): Promise<PendingApprovalRow[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('pending_approvals')
    .select(
      'id, action_name, params, risk_level, status, requester_id, thread_id, scope_id'
    )
    .eq('status', 'PENDING_APPROVAL')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data as PendingApprovalRow[]
}

/** Persist channel HITL resolution into Supabase `pending_approvals`. */
export async function updateApprovalInSupabase(opts: {
  approvalId: string
  status: ApprovalStatusRow
  resolvedBy?: string
  decisionNoteAr?: string
  actionName?: string
  params?: Record<string, unknown>
  riskLevel?: 'LOW' | 'HIGH'
  requesterId?: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { ok: false, error: 'SUPABASE_URL / key missing' }
  }

  const { error } = await supabase
    .from('pending_approvals')
    .update({
      status: opts.status,
      approved_by: opts.resolvedBy ?? null,
      resolution_note_ar: opts.decisionNoteAr ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', opts.approvalId)

  if (error) {
    const { error: upsertError } = await supabase.from('pending_approvals').upsert({
      id: opts.approvalId,
      status: opts.status,
      action_name: opts.actionName || 'channel_callback',
      params: opts.params || {},
      risk_level: opts.riskLevel || 'HIGH',
      requester_id: opts.requesterId || opts.resolvedBy || 'channel',
      approved_by: opts.resolvedBy ?? null,
      resolution_note_ar: opts.decisionNoteAr ?? null,
      resolved_at: new Date().toISOString(),
    })
    if (upsertError) {
      return { ok: false, error: upsertError.message }
    }
  }

  return { ok: true }
}

/** Save WhatsApp agent turn (prompt + reply) for audit / history. */
export async function saveWhatsAppTurnToSupabase(opts: {
  from: string
  scopeId: string
  inboundType: 'text' | 'audio'
  transcriptOrText: string
  agentReplyAr: string
  modelSlug?: string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { ok: false, error: 'SUPABASE_URL / key missing' }
  }

  const row = {
    channel: 'whatsapp',
    external_id: opts.from,
    scope_id: opts.scopeId,
    inbound_type: opts.inboundType,
    user_message_ar: opts.transcriptOrText,
    agent_reply_ar: opts.agentReplyAr,
    model_used: opts.modelSlug || process.env.DEFAULT_HARNESS_MODEL || null,
    created_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('whatsapp_messages')
    .insert(row)
    .select('id')
    .maybeSingle()

  if (!error) {
    return { ok: true, id: data?.id as string | undefined }
  }

  const { data: alt, error: altError } = await supabase
    .from('channel_messages')
    .insert({
      ...row,
      channel_kind: 'whatsapp',
    })
    .select('id')
    .maybeSingle()

  if (altError) {
    console.warn(
      '[supabase] save WhatsApp turn failed',
      error.message,
      altError.message
    )
    return { ok: false, error: altError.message }
  }

  return { ok: true, id: alt?.id as string | undefined }
}
