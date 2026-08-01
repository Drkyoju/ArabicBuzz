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
    authorNameAr: opts.agentNameAr || 'وكيل القنوات',
    content: opts.agentReplyAr,
    channel: opts.channel,
    externalId: opts.externalId,
  })
}
