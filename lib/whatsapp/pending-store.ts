/**
 * Pending WhatsApp inbox threads (owner HITL resume).
 * Prefers Supabase; falls back to in-memory for local/dev.
 */

import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { WhatsAppIntentKind } from '@/lib/whatsapp/intent'

export type InboxThreadStatus =
  | 'pending_owner'
  | 'running'
  | 'done'
  | 'cancelled'

export type WhatsAppInboxThread = {
  id: string
  requesterPhone: string
  scopeId: string
  status: InboxThreadStatus
  intentKind: WhatsAppIntentKind
  summaryAr: string
  originalMessageAr: string
  inboundType: 'text' | 'audio'
  ownerQuestionAr: string | null
  agentContextAr: string
  createdAt: string
  updatedAt: string
}

const memory = new Map<string, WhatsAppInboxThread>()

function nowIso() {
  return new Date().toISOString()
}

function rowToThread(row: Record<string, unknown>): WhatsAppInboxThread {
  return {
    id: String(row.id),
    requesterPhone: String(row.requester_phone),
    scopeId: String(row.scope_id),
    status: row.status as InboxThreadStatus,
    intentKind: row.intent_kind as WhatsAppIntentKind,
    summaryAr: String(row.summary_ar || ''),
    originalMessageAr: String(row.original_message_ar || ''),
    inboundType: (row.inbound_type as 'text' | 'audio') || 'text',
    ownerQuestionAr: row.owner_question_ar
      ? String(row.owner_question_ar)
      : null,
    agentContextAr: String(row.agent_context_ar || ''),
    createdAt: String(row.created_at || nowIso()),
    updatedAt: String(row.updated_at || nowIso()),
  }
}

export async function createInboxThread(opts: {
  requesterPhone: string
  scopeId: string
  status: InboxThreadStatus
  intentKind: WhatsAppIntentKind
  summaryAr: string
  originalMessageAr: string
  inboundType: 'text' | 'audio'
  ownerQuestionAr?: string | null
  agentContextAr?: string
}): Promise<WhatsAppInboxThread> {
  const id = crypto.randomUUID()
  const ts = nowIso()
  const thread: WhatsAppInboxThread = {
    id,
    requesterPhone: normalizePhone(opts.requesterPhone),
    scopeId: opts.scopeId,
    status: opts.status,
    intentKind: opts.intentKind,
    summaryAr: opts.summaryAr,
    originalMessageAr: opts.originalMessageAr,
    inboundType: opts.inboundType,
    ownerQuestionAr: opts.ownerQuestionAr || null,
    agentContextAr: opts.agentContextAr || '',
    createdAt: ts,
    updatedAt: ts,
  }

  const sb = getSupabaseAdmin()
  if (sb) {
    const { error } = await sb.from('whatsapp_inbox_threads').insert({
      id: thread.id,
      requester_phone: thread.requesterPhone,
      scope_id: thread.scopeId,
      status: thread.status,
      intent_kind: thread.intentKind,
      summary_ar: thread.summaryAr,
      original_message_ar: thread.originalMessageAr,
      inbound_type: thread.inboundType,
      owner_question_ar: thread.ownerQuestionAr,
      agent_context_ar: thread.agentContextAr,
      created_at: thread.createdAt,
      updated_at: thread.updatedAt,
    })
    if (error) {
      console.warn('[whatsapp-inbox] insert failed, using memory', error.message)
      memory.set(id, thread)
    }
  } else {
    memory.set(id, thread)
  }
  return thread
}

export async function updateInboxThread(
  id: string,
  patch: Partial<{
    status: InboxThreadStatus
    ownerQuestionAr: string | null
    agentContextAr: string
    summaryAr: string
  }>
): Promise<WhatsAppInboxThread | null> {
  const existing = await getInboxThread(id)
  if (!existing) return null
  const next: WhatsAppInboxThread = {
    ...existing,
    status: patch.status ?? existing.status,
    ownerQuestionAr:
      patch.ownerQuestionAr !== undefined
        ? patch.ownerQuestionAr
        : existing.ownerQuestionAr,
    agentContextAr: patch.agentContextAr ?? existing.agentContextAr,
    summaryAr: patch.summaryAr ?? existing.summaryAr,
    updatedAt: nowIso(),
  }

  const sb = getSupabaseAdmin()
  if (sb) {
    const { error } = await sb
      .from('whatsapp_inbox_threads')
      .update({
        status: next.status,
        owner_question_ar: next.ownerQuestionAr,
        agent_context_ar: next.agentContextAr,
        summary_ar: next.summaryAr,
        updated_at: next.updatedAt,
      })
      .eq('id', id)
    if (error) {
      console.warn('[whatsapp-inbox] update failed', error.message)
      memory.set(id, next)
    }
  } else {
    memory.set(id, next)
  }
  return next
}

export async function getInboxThread(
  id: string
): Promise<WhatsAppInboxThread | null> {
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('whatsapp_inbox_threads')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (!error && data) return rowToThread(data as Record<string, unknown>)
  }
  return memory.get(id) || null
}

/** Latest pending_owner thread for a requester (or any if phone omitted). */
export async function findPendingOwnerThread(opts?: {
  requesterPhone?: string
  scopeId?: string
}): Promise<WhatsAppInboxThread | null> {
  const phone = opts?.requesterPhone
    ? normalizePhone(opts.requesterPhone)
    : undefined
  const sb = getSupabaseAdmin()
  if (sb) {
    let q = sb
      .from('whatsapp_inbox_threads')
      .select('*')
      .eq('status', 'pending_owner')
      .order('updated_at', { ascending: false })
      .limit(1)
    if (phone) q = q.eq('requester_phone', phone)
    if (opts?.scopeId) q = q.eq('scope_id', opts.scopeId)
    const { data, error } = await q.maybeSingle()
    if (!error && data) return rowToThread(data as Record<string, unknown>)
  }

  const list = [...memory.values()]
    .filter((t) => t.status === 'pending_owner')
    .filter((t) => (phone ? t.requesterPhone === phone : true))
    .filter((t) => (opts?.scopeId ? t.scopeId === opts.scopeId : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return list[0] || null
}

/** Most recent pending owner thread overall (for owner WhatsApp replies). */
export async function findLatestPendingOwnerThread(scopeId?: string) {
  return findPendingOwnerThread({ scopeId })
}

export async function listPendingOwnerThreads(
  scopeId?: string,
  limit = 20
): Promise<WhatsAppInboxThread[]> {
  const sb = getSupabaseAdmin()
  if (sb) {
    let q = sb
      .from('whatsapp_inbox_threads')
      .select('*')
      .eq('status', 'pending_owner')
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (scopeId) q = q.eq('scope_id', scopeId)
    const { data, error } = await q
    if (!error && data) {
      return (data as Record<string, unknown>[]).map(rowToThread)
    }
  }
  return [...memory.values()]
    .filter((t) => t.status === 'pending_owner')
    .filter((t) => (scopeId ? t.scopeId === scopeId : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
}

export function normalizePhone(raw: string) {
  return raw.replace(/[^\d]/g, '')
}

export function isOwnerPhone(from: string) {
  const owner = process.env.WHATSAPP_OWNER_TO?.trim()
  if (!owner) return false
  return normalizePhone(from) === normalizePhone(owner)
}
