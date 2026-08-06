import { getSupabaseAdmin } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export type ItemAckKind = 'post' | 'canvas'

export type ItemAck = {
  id: string
  scopeId: string
  itemKind: ItemAckKind
  itemId: string
  userId: string
  userAr: string
  createdAt: string
}

type DbRow = Record<string, unknown>
const mem = new Map<string, ItemAck[]>()

function rowToAck(r: DbRow): ItemAck {
  return {
    id: String(r.id),
    scopeId: String(r.scope_id),
    itemKind: (r.item_kind === 'canvas' ? 'canvas' : 'post') as ItemAckKind,
    itemId: String(r.item_id),
    userId: String(r.user_id),
    userAr: String(r.user_ar || 'عضو'),
    createdAt: String(r.created_at),
  }
}

function memKey(kind: ItemAckKind, itemId: string) {
  return `${kind}:${itemId}`
}

/** True if title/content looks like a decision or minutes doc. */
export function looksLikeDecisionOrMinutes(text: string): boolean {
  return /قرار|قرارات|محضر|محاضر/.test(text || '')
}

export async function listItemAcks(
  itemKind: ItemAckKind,
  itemId: string
): Promise<ItemAck[]> {
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('room_item_acks')
      .select('*')
      .eq('item_kind', itemKind)
      .eq('item_id', itemId)
      .order('created_at', { ascending: true })
      .limit(100)
    if (!error && data) return (data as DbRow[]).map(rowToAck)
  }
  return (mem.get(memKey(itemKind, itemId)) || []).slice()
}

export async function toggleItemAck(opts: {
  scopeId: string
  itemKind: ItemAckKind
  itemId: string
  userId: string
  userAr: string
  seen: boolean
}): Promise<{ acks: ItemAck[]; seen: boolean }> {
  const sb = getSupabaseAdmin()
  const key = memKey(opts.itemKind, opts.itemId)

  if (opts.seen) {
    if (sb) {
      const { data: existing } = await sb
        .from('room_item_acks')
        .select('*')
        .eq('item_kind', opts.itemKind)
        .eq('item_id', opts.itemId)
        .eq('user_id', opts.userId)
        .maybeSingle()
      if (!existing) {
        await sb.from('room_item_acks').insert({
          id: randomUUID(),
          scope_id: opts.scopeId,
          item_kind: opts.itemKind,
          item_id: opts.itemId,
          user_id: opts.userId,
          user_ar: opts.userAr,
        })
      }
    } else {
      const list = mem.get(key) || []
      if (!list.some((a) => a.userId === opts.userId)) {
        list.push({
          id: randomUUID(),
          scopeId: opts.scopeId,
          itemKind: opts.itemKind,
          itemId: opts.itemId,
          userId: opts.userId,
          userAr: opts.userAr,
          createdAt: new Date().toISOString(),
        })
        mem.set(key, list)
      }
    }
  } else {
    if (sb) {
      await sb
        .from('room_item_acks')
        .delete()
        .eq('item_kind', opts.itemKind)
        .eq('item_id', opts.itemId)
        .eq('user_id', opts.userId)
    } else {
      mem.set(
        key,
        (mem.get(key) || []).filter((a) => a.userId !== opts.userId)
      )
    }
  }

  const acks = await listItemAcks(opts.itemKind, opts.itemId)
  return {
    acks,
    seen: acks.some((a) => a.userId === opts.userId),
  }
}
