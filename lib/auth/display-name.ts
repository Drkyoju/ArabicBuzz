import type { User } from '@supabase/supabase-js'

/** True when a label is an email or the email's local-part (not a real display name). */
export function looksLikeEmailLabel(
  name: string | null | undefined,
  email?: string | null
): boolean {
  const n = String(name || '').trim()
  if (!n) return true
  if (n.includes('@')) return true
  const local = String(email || '')
    .split('@')[0]
    ?.trim()
    .toLowerCase()
  if (local && n.toLowerCase() === local) return true
  return false
}

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Prefer Google / OAuth profile fields over email local-part.
 * Order: full_name → name → given+family → display_name → preferred_username → email local-part.
 */
export function displayNameFromMetadata(
  meta: Record<string, unknown> | null | undefined,
  opts?: { email?: string | null; fallback?: string }
): string {
  const m = meta || {}
  const full = trimStr(m.full_name)
  const name = trimStr(m.name)
  const given = trimStr(m.given_name)
  const family = trimStr(m.family_name)
  const composed = [given, family].filter(Boolean).join(' ').trim()
  const display = trimStr(m.display_name)
  const preferred = trimStr(m.preferred_username)

  const candidates = [full, name, composed, display, preferred].filter(Boolean)
  const email = opts?.email || null

  for (const c of candidates) {
    if (!looksLikeEmailLabel(c, email)) return c
  }
  for (const c of candidates) {
    if (c && !c.includes('@')) return c
  }

  const local = email?.includes('@') ? email.split('@')[0] : ''
  return local || opts?.fallback || 'مستخدم'
}

/** Resolve a human-facing display name from a Supabase auth user. */
export function displayNameFromUser(
  user: User | null | undefined,
  fallback = 'مستخدم'
): string {
  if (!user) return fallback
  return displayNameFromMetadata(
    (user.user_metadata || {}) as Record<string, unknown>,
    { email: user.email, fallback }
  )
}

/**
 * Google / OAuth name only — no email local-part fallback.
 * Used when deciding whether to persist or backfill.
 */
export function googleProfileDisplayName(
  user: User | null | undefined
): string | null {
  if (!user) return null
  const meta = (user.user_metadata || {}) as Record<string, unknown>
  const full = trimStr(meta.full_name)
  const name = trimStr(meta.name)
  const given = trimStr(meta.given_name)
  const family = trimStr(meta.family_name)
  const composed = [given, family].filter(Boolean).join(' ').trim()
  const display = trimStr(meta.display_name)
  for (const c of [full, name, composed, display]) {
    if (c && !looksLikeEmailLabel(c, user.email)) return c
  }
  return null
}

/**
 * Prefer an explicit override (rename / localStorage) when it is a real name;
 * otherwise fall back to Google profile fields.
 */
export function resolveClientDisplayName(opts: {
  user?: User | null
  override?: string | null
  fallback?: string
}): string {
  const override = String(opts.override || '').trim()
  const email = opts.user?.email || null
  if (override && !looksLikeEmailLabel(override, email)) {
    return override
  }
  return displayNameFromUser(opts.user, opts.fallback || 'أنت')
}
