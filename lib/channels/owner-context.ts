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

/**
 * Prefer env, otherwise latest Google-linked account (calendar/drive owner).
 */
export async function resolveChannelOwnerUserIdAsync(
  fallbackRequesterId?: string
) {
  const explicit =
    process.env.CHANNEL_OWNER_USER_ID?.trim() ||
    process.env.TELEGRAM_OWNER_USER_ID?.trim() ||
    process.env.WHATSAPP_OWNER_USER_ID?.trim()
  if (explicit) return explicit

  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/server')
    const sb = getSupabaseAdmin()
    if (sb) {
      const { data } = await sb
        .from('google_oauth_tokens')
        .select('user_id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data?.user_id) return String(data.user_id)
    }
  } catch {
    /* ignore */
  }

  return resolveChannelOwnerUserId(fallbackRequesterId)
}
