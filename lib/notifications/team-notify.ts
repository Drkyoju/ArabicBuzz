/**
 * Notify a room member (prefer Telegram DM if bound, else room channel).
 * No per-app-user Telegram table yet — try channel_bindings.user_id match, else room.
 */
import { emitNotification } from '@/lib/notifications/emit'
import { getSupabaseAdmin } from '@/lib/supabase/server'

async function findUserTelegramChatId(opts: {
  userId?: string | null
  email?: string | null
}): Promise<string | null> {
  const sb = getSupabaseAdmin()
  if (!sb) return null
  if (opts.userId) {
    const { data } = await sb
      .from('channel_bindings')
      .select('external_id')
      .eq('channel', 'telegram')
      .eq('user_id', opts.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.external_id) return String(data.external_id)
  }
  return null
}

export async function notifyRoomMember(opts: {
  scopeId: string
  textAr: string
  memberUserId?: string | null
  memberEmail?: string | null
  displayNameAr?: string
}): Promise<{ ok: boolean; via: 'dm' | 'room' | 'none' }> {
  const dm = await findUserTelegramChatId({
    userId: opts.memberUserId,
    email: opts.memberEmail,
  }).catch(() => null)

  if (dm) {
    const r = await emitNotification({
      channel: 'telegram',
      textAr: opts.textAr,
      to: dm,
      meta: { scopeId: opts.scopeId },
    })
    return { ok: r.ok, via: r.ok ? 'dm' : 'none' }
  }

  const name = opts.displayNameAr?.trim()
  const textAr = name
    ? `👤 إلى ${name}:\n${opts.textAr}`
    : opts.textAr

  const r = await emitNotification({
    channel: 'telegram',
    textAr,
    meta: { scopeId: opts.scopeId },
  })
  return { ok: r.ok, via: r.ok ? 'room' : 'none' }
}

export async function notifyTaskAssigned(opts: {
  scopeId: string
  titleAr: string
  assigneeAr: string
  assigneeEmail?: string | null
  assigneeUserId?: string | null
  assignerAr?: string
}): Promise<void> {
  const who = opts.assignerAr ? `من: ${opts.assignerAr}\n` : ''
  await notifyRoomMember({
    scopeId: opts.scopeId,
    memberUserId: opts.assigneeUserId,
    memberEmail: opts.assigneeEmail,
    displayNameAr: opts.assigneeAr,
    textAr: `📌 كُلّفت بمهمة في Arabic Buzz\n«${opts.titleAr}»\n${who}الغرفة: ${opts.scopeId}`,
  }).catch(() => undefined)
}

export async function notifyMemberMentioned(opts: {
  scopeId: string
  mentionNameAr: string
  mentionUserId?: string | null
  mentionEmail?: string | null
  fromAr: string
  excerpt: string
}): Promise<void> {
  await notifyRoomMember({
    scopeId: opts.scopeId,
    memberUserId: opts.mentionUserId,
    memberEmail: opts.mentionEmail,
    displayNameAr: opts.mentionNameAr,
    textAr: `📣 ذكرك ${opts.fromAr} في غرفة Arabic Buzz\n«${opts.excerpt.slice(0, 280)}»\nالغرفة: ${opts.scopeId}`,
  }).catch(() => undefined)
}
