import { insertRoomPost } from '@/lib/rooms/persist'

/**
 * Persist a Telegram/WhatsApp turn for the **channel feed** (live pane).
 *
 * For Telegram: posts are tagged `channel: 'telegram'` so غرفة الفريق chat
 * does **not** show them again (see `shouldShowInRoomChat`). Full chat sync
 * both ways would duplicate every line — text stays in the live pane only.
 * Media is imported separately into the vault via `afterTelegramMediaSaved`.
 *
 * `includeAgentReply: false` = user/group line only (silent execute / no spam).
 */
export async function mirrorChannelTurnToRoom(opts: {
  scopeId: string
  channel: 'telegram' | 'whatsapp'
  externalId: string
  userLabelAr: string
  userMessageAr: string
  agentReplyAr: string
  agentNameAr?: string
  /** Default true. Set false when the bot stayed silent in the group. */
  includeAgentReply?: boolean
}) {
  const channelLabel =
    opts.channel === 'telegram' ? 'تيليجرام' : 'واتساب'
  await insertRoomPost({
    scopeId: opts.scopeId,
    authorKind: 'channel',
    authorId: opts.externalId,
    authorNameAr: `${opts.userLabelAr} · ${channelLabel}`,
    content: opts.userMessageAr,
    channel: opts.channel,
    externalId: opts.externalId,
  })
  if (opts.includeAgentReply === false) return
  const reply = String(opts.agentReplyAr || '').trim()
  if (!reply) return
  await insertRoomPost({
    scopeId: opts.scopeId,
    authorKind: 'agent',
    authorId: 'agent-channels',
    authorNameAr: opts.agentNameAr || 'رد الوكيل · القنوات',
    content: reply,
    channel: opts.channel,
    externalId: opts.externalId,
  })
}

/** Single labeled room note for WhatsApp inbox events. */
export async function mirrorWhatsAppInboxNote(opts: {
  scopeId: string
  externalId: string
  /** e.g. طلب من واتساب / سؤال لك / اكتمل */
  labelAr: string
  contentAr: string
  authorKind?: 'channel' | 'agent' | 'system' | 'human'
  authorId?: string
}) {
  await insertRoomPost({
    scopeId: opts.scopeId,
    authorKind: opts.authorKind || 'system',
    authorId: opts.authorId || 'whatsapp-inbox',
    authorNameAr: opts.labelAr,
    content: opts.contentAr,
    channel: 'whatsapp',
    externalId: opts.externalId,
  })
}
