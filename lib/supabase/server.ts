import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** Server-side Supabase client (Netlify env: SUPABASE_URL + key). */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

export type ApprovalStatusRow = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'

/** Persist channel HITL resolution into Supabase `pending_approvals`. */
export async function updateApprovalInSupabase(opts: {
  approvalId: string
  status: ApprovalStatusRow
  resolvedBy?: string
  decisionNoteAr?: string
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
      action_name: 'channel_callback',
      params: {},
      risk_level: 'HIGH',
      requester_id: opts.resolvedBy || 'channel',
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
