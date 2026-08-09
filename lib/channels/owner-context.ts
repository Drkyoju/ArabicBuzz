/**
 * Resolve the owner user id used for channel-driven agent tasks.
 * This lets Telegram/WhatsApp requests act on owner's connected tools.
 *
 * Order: explicit env → Google OAuth row for workspace owner email
 * (ryodan71@gmail.com / OWNER_EMAIL) → latest Google-linked account → fallback.
 */
export function resolveChannelOwnerUserId(fallbackRequesterId?: string) {
  const explicit =
    process.env.CHANNEL_OWNER_USER_ID?.trim() ||
    process.env.TELEGRAM_OWNER_USER_ID?.trim() ||
    process.env.DRIVE_BRAIN_OWNER_USER_ID?.trim() ||
    process.env.BRAIN_OWNER_USER_ID?.trim() ||
    process.env.WHATSAPP_OWNER_USER_ID?.trim()
  if (explicit) return explicit
  return fallbackRequesterId || 'local-owner'
}

async function resolveOwnerFromGoogleOauth(): Promise<string | null> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/server')
    const { getWorkspaceOwnerEmail } = await import('@/lib/auth/roles')
    const sb = getSupabaseAdmin()
    if (!sb) return null

    const ownerEmail = getWorkspaceOwnerEmail()
    if (ownerEmail) {
      const { data: byEmail } = await sb
        .from('google_oauth_tokens')
        .select('user_id')
        .ilike('email', ownerEmail)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (byEmail?.user_id) return String(byEmail.user_id)
    }

    const { data } = await sb
      .from('google_oauth_tokens')
      .select('user_id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.user_id) return String(data.user_id)
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Prefer env, otherwise Google-linked account for owner email (Drive archive).
 */
export async function resolveChannelOwnerUserIdAsync(
  fallbackRequesterId?: string
) {
  const explicit =
    process.env.CHANNEL_OWNER_USER_ID?.trim() ||
    process.env.TELEGRAM_OWNER_USER_ID?.trim() ||
    process.env.DRIVE_BRAIN_OWNER_USER_ID?.trim() ||
    process.env.BRAIN_OWNER_USER_ID?.trim() ||
    process.env.WHATSAPP_OWNER_USER_ID?.trim()
  if (explicit) return explicit

  const fromGoogle = await resolveOwnerFromGoogleOauth()
  if (fromGoogle) return fromGoogle

  return resolveChannelOwnerUserId(fallbackRequesterId)
}

/** Drive brain cron / archive — same resolve order, no requester fallback. */
export async function resolveDriveBrainOwnerUserId(): Promise<string | null> {
  const explicit =
    process.env.BRAIN_OWNER_USER_ID?.trim() ||
    process.env.DRIVE_BRAIN_OWNER_USER_ID?.trim() ||
    process.env.CHANNEL_OWNER_USER_ID?.trim() ||
    process.env.TELEGRAM_OWNER_USER_ID?.trim() ||
    ''
  if (explicit) return explicit
  return resolveOwnerFromGoogleOauth()
}
