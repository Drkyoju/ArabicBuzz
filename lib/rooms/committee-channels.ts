/**
 * Telegram committee channels bound to the same room (finance / programs / board).
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { upsertChannelBinding } from '@/lib/channels/bindings'

export const COMMITTEE_KEYS = ['finance', 'programs', 'board'] as const
export type CommitteeKey = (typeof COMMITTEE_KEYS)[number]

export const COMMITTEE_LABELS_AR: Record<CommitteeKey, string> = {
  finance: 'اللجنة المالية',
  programs: 'لجنة البرامج',
  board: 'مجلس الإدارة',
}

export type CommitteeChannel = {
  id: string
  scopeId: string
  committeeKey: CommitteeKey
  nameAr: string
  chatId: string
  createdAt: string
}

const mem = new Map<string, CommitteeChannel[]>()

function memList(scopeId: string) {
  if (!mem.has(scopeId)) mem.set(scopeId, [])
  return mem.get(scopeId)!
}

function rowToChannel(r: Record<string, unknown>): CommitteeChannel {
  return {
    id: String(r.id),
    scopeId: String(r.scope_id),
    committeeKey: r.committee_key as CommitteeKey,
    nameAr: String(r.name_ar),
    chatId: String(r.chat_id),
    createdAt: String(r.created_at),
  }
}

export function parseCommitteeStartPayload(payload: string): {
  scopeId: string
  committeeKey: CommitteeKey | null
} | null {
  const raw = payload.trim()
  if (!raw) return null
  // scope_<id>__c_<key>  or  scope_<id>_c_<key>
  const m = raw.match(
    /^scope[_-]?(.+?)(?:__c_|_c_)(finance|programs|board)$/i
  )
  if (m) {
    return {
      scopeId: m[1]!,
      committeeKey: m[2]!.toLowerCase() as CommitteeKey,
    }
  }
  const scopeOnly = raw.replace(/^scope[_-]/i, '')
  if (scopeOnly) return { scopeId: scopeOnly, committeeKey: null }
  return null
}

export function committeeDeepLinkPath(
  scopeId: string,
  committeeKey: CommitteeKey
) {
  return `scope_${scopeId}__c_${committeeKey}`
}

export async function listCommitteeChannels(
  scopeId: string
): Promise<CommitteeChannel[]> {
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('room_committee_channels')
      .select('*')
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: true })
    if (!error && data) {
      return (data as Array<Record<string, unknown>>).map(rowToChannel)
    }
  }
  return [...memList(scopeId)]
}

export async function upsertCommitteeChannel(opts: {
  scopeId: string
  committeeKey: CommitteeKey
  chatId: string
  nameAr?: string
}): Promise<{ ok: boolean; channel?: CommitteeChannel; error?: string }> {
  const chatId = opts.chatId.trim()
  if (!chatId) return { ok: false, error: 'معرّف محادثة تيليجرام مطلوب' }
  if (!(COMMITTEE_KEYS as readonly string[]).includes(opts.committeeKey)) {
    return { ok: false, error: 'نوع لجنة غير معروف' }
  }
  const nameAr =
    opts.nameAr?.trim() || COMMITTEE_LABELS_AR[opts.committeeKey]
  const now = new Date().toISOString()
  const channel: CommitteeChannel = {
    id: randomUUID(),
    scopeId: opts.scopeId,
    committeeKey: opts.committeeKey,
    nameAr,
    chatId,
    createdAt: now,
  }

  // Also bind chat → room so inbound messages land in the same scope
  await upsertChannelBinding({
    channel: 'telegram',
    externalId: chatId,
    scopeId: opts.scopeId,
  })

  const sb = getSupabaseAdmin()
  if (sb) {
    const { data: existing } = await sb
      .from('room_committee_channels')
      .select('id')
      .eq('scope_id', opts.scopeId)
      .eq('committee_key', opts.committeeKey)
      .maybeSingle()

    if (existing?.id) {
      const { data, error } = await sb
        .from('room_committee_channels')
        .update({
          chat_id: chatId,
          name_ar: nameAr,
        })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) {
        // table may not exist — memory fallback
        const list = memList(opts.scopeId)
        const idx = list.findIndex(
          (c) => c.committeeKey === opts.committeeKey
        )
        if (idx >= 0) list[idx] = { ...list[idx]!, chatId, nameAr }
        else list.push(channel)
        return { ok: true, channel, error: error.message }
      }
      return { ok: true, channel: rowToChannel(data as Record<string, unknown>) }
    }

    const { data, error } = await sb
      .from('room_committee_channels')
      .insert({
        id: channel.id,
        scope_id: channel.scopeId,
        committee_key: channel.committeeKey,
        name_ar: channel.nameAr,
        chat_id: channel.chatId,
        created_at: channel.createdAt,
      })
      .select('*')
      .single()

    if (error) {
      const list = memList(opts.scopeId)
      const idx = list.findIndex((c) => c.committeeKey === opts.committeeKey)
      if (idx >= 0) list[idx] = channel
      else list.push(channel)
      return { ok: true, channel, error: error.message }
    }
    return { ok: true, channel: rowToChannel(data as Record<string, unknown>) }
  }

  const list = memList(opts.scopeId)
  const idx = list.findIndex((c) => c.committeeKey === opts.committeeKey)
  if (idx >= 0) {
    list[idx] = { ...list[idx]!, chatId, nameAr }
    return { ok: true, channel: list[idx] }
  }
  list.push(channel)
  return { ok: true, channel }
}

export async function removeCommitteeChannel(opts: {
  scopeId: string
  committeeKey: CommitteeKey
}): Promise<{ ok: boolean }> {
  const sb = getSupabaseAdmin()
  if (sb) {
    await sb
      .from('room_committee_channels')
      .delete()
      .eq('scope_id', opts.scopeId)
      .eq('committee_key', opts.committeeKey)
  }
  const list = memList(opts.scopeId)
  const idx = list.findIndex((c) => c.committeeKey === opts.committeeKey)
  if (idx >= 0) list.splice(idx, 1)
  return { ok: true }
}

export async function resolveCommitteeChatId(
  scopeId: string,
  committeeKey: CommitteeKey
): Promise<string | null> {
  const list = await listCommitteeChannels(scopeId)
  return list.find((c) => c.committeeKey === committeeKey)?.chatId || null
}
