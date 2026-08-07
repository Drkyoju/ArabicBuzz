/**
 * Remember Telegram peers who spoke in a linked room so «أرسل لفلان» can resolve.
 * Private chat_id === Telegram user id; bots can only DM users who started the bot.
 */
import {
  lookupChannelBinding,
  upsertChannelBinding,
} from '@/lib/channels/bindings'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { listRoomMembers } from '@/lib/rooms/persist'
import { emitNotification } from '@/lib/notifications/emit'

export type TelegramPeer = {
  tgUserId: string
  nameAr: string
  username?: string | null
  scopeId: string
}

function normalizeName(s: string): string {
  return s
    .trim()
    .replace(/[ـ\u0640]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function nameMatches(query: string, candidate: string): boolean {
  const q = normalizeName(query)
  const c = normalizeName(candidate)
  if (!q || !c) return false
  if (q === c) return true
  if (c.includes(q) || q.includes(c)) return q.length >= 2
  return false
}

/** Persist peer when they message (group or DM) so later sends can resolve by name. */
export async function rememberTelegramPeer(opts: {
  scopeId: string
  tgUserId: string
  firstName?: string | null
  lastName?: string | null
  username?: string | null
}): Promise<void> {
  const tgUserId = String(opts.tgUserId || '').trim()
  if (!tgUserId || !/^-?\d+$/.test(tgUserId) || tgUserId.startsWith('-')) {
    return
  }
  const nameAr =
    [opts.firstName, opts.lastName].filter(Boolean).join(' ').trim() ||
    (opts.username ? `@${opts.username}` : '') ||
    tgUserId
  const label = opts.username
    ? `@${opts.username}|${nameAr}`
    : nameAr

  await upsertChannelBinding({
    channel: 'telegram',
    externalId: tgUserId,
    scopeId: opts.scopeId,
    userId: label.slice(0, 120),
  }).catch(() => undefined)
}

async function listScopeTelegramBindings(scopeId: string): Promise<
  Array<{ externalId: string; userId: string | null }>
> {
  const sb = getSupabaseAdmin()
  if (!sb) return []
  const { data } = await sb
    .from('channel_bindings')
    .select('external_id, user_id')
    .eq('channel', 'telegram')
    .eq('scope_id', scopeId)
    .limit(200)
  if (!data?.length) return []
  return data.map((r) => ({
    externalId: String(r.external_id),
    userId: r.user_id ? String(r.user_id) : null,
  }))
}

export async function findTelegramPeersByName(
  scopeId: string,
  nameQuery: string
): Promise<TelegramPeer[]> {
  const q = nameQuery.trim().replace(/^@/, '')
  if (!q) return []

  const found: TelegramPeer[] = []
  const seen = new Set<string>()

  const push = (p: TelegramPeer) => {
    if (seen.has(p.tgUserId)) return
    seen.add(p.tgUserId)
    found.push(p)
  }

  try {
    const { members } = await listRoomMembers(scopeId)
    for (const m of members) {
      if (!nameMatches(q, m.displayNameAr)) continue
      let tgId: string | null = null
      if (m.userId) {
        const binding = await lookupChannelBinding({
          channel: 'telegram',
          externalId: m.userId,
        }).catch(() => null)
        if (binding && !binding.externalId.startsWith('-')) {
          tgId = binding.externalId
        }
        const sb = getSupabaseAdmin()
        if (!tgId && sb) {
          const { data } = await sb
            .from('channel_bindings')
            .select('external_id')
            .eq('channel', 'telegram')
            .eq('user_id', m.userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (data?.external_id && !String(data.external_id).startsWith('-')) {
            tgId = String(data.external_id)
          }
        }
      }
      if (tgId) {
        push({
          tgUserId: tgId,
          nameAr: m.displayNameAr,
          scopeId,
        })
      } else {
        // Member matched by name but no DM path yet — keep placeholder for group fallback
        push({
          tgUserId: '',
          nameAr: m.displayNameAr,
          scopeId,
        })
      }
    }
  } catch {
    /* ignore */
  }

  const bindings = await listScopeTelegramBindings(scopeId).catch(() => [])
  for (const b of bindings) {
    if (!b.externalId || b.externalId.startsWith('-')) continue
    const label = b.userId || ''
    const [maybeUser, maybeName] = label.includes('|')
      ? label.split('|', 2)
      : [label.startsWith('@') ? label : '', label]
    const username = maybeUser?.startsWith('@') ? maybeUser.slice(1) : null
    const nameAr = (maybeName || label || b.externalId).replace(/^@/, '')
    if (
      nameMatches(q, nameAr) ||
      (username && nameMatches(q, username)) ||
      (label && nameMatches(q, label))
    ) {
      push({
        tgUserId: b.externalId,
        nameAr: nameAr || b.externalId,
        username,
        scopeId,
      })
    }
  }

  return found.filter((p) => p.nameAr)
}

export type DeliverTelegramMessageResult = {
  ok: boolean
  via: 'dm' | 'group' | 'none'
  messageAr: string
  targetNameAr?: string
  limitsAr?: string
}

/**
 * Send to a named peer (DM if reachable) or fall back to the linked group chat.
 */
export async function deliverNamedTelegramMessage(opts: {
  scopeId: string
  targetNameAr: string
  textAr: string
  /** Linked group chat id for fallback mention post. */
  groupChatId?: string | null
  fromLabelAr?: string
}): Promise<DeliverTelegramMessageResult> {
  const text = opts.textAr.trim()
  if (!text) {
    return { ok: false, via: 'none', messageAr: 'لا يوجد نص للإرسال.' }
  }

  const peers = await findTelegramPeersByName(opts.scopeId, opts.targetNameAr)
  const withDm = peers.find((p) => p.tgUserId)
  const any = withDm || peers[0]
  const targetName = any?.nameAr || opts.targetNameAr.trim()
  const from = opts.fromLabelAr ? `من ${opts.fromLabelAr}:\n` : ''

  const limitsAr =
    'حدود تيليجرام: البوت لا يفتح محادثة خاصة مع من لم يضغط Start على البوت سابقاً. إن فشل الخاص تُنشر في المجموعة المربوطة.'

  if (withDm?.tgUserId) {
    const body = `📨 رسالة عبر Arabic Buzz\n${from}${text}`
    const sent = await emitNotification({
      channel: 'telegram',
      textAr: body,
      to: withDm.tgUserId,
      meta: { scopeId: opts.scopeId },
    })
    if (sent.ok) {
      return {
        ok: true,
        via: 'dm',
        targetNameAr: targetName,
        messageAr: `أُرسلت رسالة خاصة إلى «${targetName}».`,
        limitsAr,
      }
    }
  }

  const groupId = opts.groupChatId?.trim()
  if (groupId) {
    const mention = any?.username ? `@${any.username}` : `إلى ${targetName}`
    const body = `📨 ${mention}\n${from}${text}`
    const sent = await emitNotification({
      channel: 'telegram',
      textAr: body,
      to: groupId,
      meta: { scopeId: opts.scopeId },
    })
    if (sent.ok) {
      return {
        ok: true,
        via: 'group',
        targetNameAr: targetName,
        messageAr: withDm
          ? `تعذّر الخاص لـ «${targetName}» (لم يبدأ البوت غالباً) — نُشرت في المجموعة.`
          : `نُشرت في المجموعة موجّهة إلى «${targetName}» (لا معرف خاص محفوظ).`,
        limitsAr,
      }
    }
  }

  return {
    ok: false,
    via: 'none',
    targetNameAr: targetName,
    messageAr: any
      ? `تعذّر إيصال الرسالة إلى «${targetName}». يجب أن يبدأ البوت خاصاً، أو اربط المجموعة بـ /link.`
      : `لم أجد «${opts.targetNameAr}» بين أعضاء الغرفة أو من كتب في المجموعة. اطلب منه مراسلة البوت أو اكتب في المجموعة مرة.`,
    limitsAr,
  }
}

export async function deliverGroupBroadcast(opts: {
  scopeId: string
  textAr: string
  groupChatId: string
  fromLabelAr?: string
}): Promise<DeliverTelegramMessageResult> {
  const text = opts.textAr.trim()
  if (!text) {
    return { ok: false, via: 'none', messageAr: 'لا يوجد نص للإرسال.' }
  }
  const from = opts.fromLabelAr ? `من ${opts.fromLabelAr}:\n` : ''
  const sent = await emitNotification({
    channel: 'telegram',
    textAr: `📣 تنبيه للمجموعة\n${from}${text}`,
    to: opts.groupChatId,
    meta: { scopeId: opts.scopeId },
  })
  return {
    ok: sent.ok,
    via: sent.ok ? 'group' : 'none',
    messageAr: sent.ok
      ? 'أُرسل التنبيه إلى المجموعة المربوطة.'
      : 'تعذّر الإرسال للمجموعة — تحقق من /link وصلاحيات البوت.',
  }
}
