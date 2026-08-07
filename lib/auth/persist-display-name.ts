import type { User } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import {
  displayNameFromUser,
  googleProfileDisplayName,
  looksLikeEmailLabel,
} from '@/lib/auth/display-name'

/**
 * On first Google sign-in (or when full_name is missing / email-like),
 * persist a proper display name into user_metadata.full_name.
 * Does not overwrite an intentional rename.
 */
export async function ensureDisplayNamePersisted(
  user: User
): Promise<string> {
  const resolved = displayNameFromUser(user)
  const meta = (user.user_metadata || {}) as Record<string, unknown>
  const current =
    typeof meta.full_name === 'string' ? meta.full_name.trim() : ''
  const fromGoogle = googleProfileDisplayName(user)

  // Keep intentional renames; only fill / upgrade email-like labels.
  if (current && !looksLikeEmailLabel(current, user.email)) {
    return current
  }
  if (!fromGoogle) return resolved
  if (current === fromGoogle) return fromGoogle

  const admin = getSupabaseAdmin()
  if (!admin || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fromGoogle
  }
  if (user.id === 'local-owner' || user.app_metadata?.provider === 'local') {
    return fromGoogle
  }

  try {
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...meta,
        full_name: fromGoogle,
      },
    })
  } catch {
    /* non-fatal — UI still uses resolved name */
  }
  return fromGoogle
}
