/**
 * Resolve the owner user id used for channel-driven agent tasks.
 * This lets Telegram/WhatsApp requests act on owner's connected tools.
 */
export function resolveChannelOwnerUserId(fallbackRequesterId?: string) {
  const explicit =
    process.env.CHANNEL_OWNER_USER_ID?.trim() ||
    process.env.TELEGRAM_OWNER_USER_ID?.trim() ||
    process.env.WHATSAPP_OWNER_USER_ID?.trim()
  if (explicit) return explicit
  return fallbackRequesterId || 'local-owner'
}

