import { insertRoomPost } from '@/lib/rooms/persist'

/** Mirror an inbound/outbound channel turn into a room timeline. */
export async function mirrorChannelTurnToRoom(opts: {
  scopeId: string
  channel: 'telegram' | 'whatsapp'
  externalId: string
  userLabelAr: string
  userMessageAr: string
  agentReplyAr: string
  agentNameAr?: string
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
  await insertRoomPost({
    scopeId: opts.scopeId,
    authorKind: 'agent',
    authorId: 'agent-channels',
    authorNameAr: opts.agentNameAr || 'رد الوكيل · القنوات',
    content: opts.agentReplyAr,
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
