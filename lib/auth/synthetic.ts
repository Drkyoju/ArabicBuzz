/**
 * Placeholder identities created by soft-auth / in-memory fallbacks.
 *
 * They exist so the workspace renders before a real session, but they must
 * never appear as real people: no invitee emails, no member rows, no
 * "who was here" entries.
 */

const SYNTHETIC_USER_IDS = new Set(['local-owner', 'engine', 'system'])

/** Hostnames we mint placeholder addresses on. */
const SYNTHETIC_EMAIL_DOMAINS = ['arabicbuzz.local', 'example.com', 'localhost']

export function isSyntheticEmail(email?: string | null): boolean {
  const value = email?.trim().toLowerCase()
  if (!value || !value.includes('@')) return false
  const domain = value.split('@').pop() || ''
  return (
    domain.endsWith('.local') ||
    SYNTHETIC_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))
  )
}

export function isSyntheticUserId(userId?: string | null): boolean {
  const value = userId?.trim()
  if (!value) return false
  return SYNTHETIC_USER_IDS.has(value) || /^user-\d+$/.test(value)
}

/** True when a row is a placeholder rather than a real person. */
export function isSyntheticIdentity(identity: {
  email?: string | null
  userId?: string | null
}): boolean {
  return (
    isSyntheticEmail(identity.email) || isSyntheticUserId(identity.userId)
  )
}

/** Drop placeholder emails so they never reach invite / calendar payloads. */
export function realEmailsOnly(
  emails: Array<string | null | undefined>
): string[] {
  return [
    ...new Set(
      emails
        .map((e) => e?.trim().toLowerCase() || '')
        .filter((e) => e.includes('@') && !isSyntheticEmail(e))
    ),
  ]
}
