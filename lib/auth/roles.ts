import type { Role, UiPersona } from '@/lib/auth/rbac-types'

/** Always treated as director unless removed from env *and* this constant (env can only add). */
export const DEFAULT_DIRECTOR_EMAIL = 'ryodan71@gmail.com'

export function normalizeEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase()
}

/**
 * Director allow-list from `DIRECTOR_EMAILS` (comma-separated) and legacy
 * `DIRECTOR_EMAIL`. Always includes `ryodan71@gmail.com`.
 */
export function getDirectorEmails(): string[] {
  const fromList = (process.env.DIRECTOR_EMAILS || '')
    .split(',')
    .map((e) => normalizeEmail(e))
    .filter(Boolean)
  const legacy = normalizeEmail(process.env.DIRECTOR_EMAIL)
  const set = new Set<string>([DEFAULT_DIRECTOR_EMAIL, ...fromList])
  if (legacy) set.add(legacy)
  return [...set]
}

export function isDirectorEmail(email: string | null | undefined): boolean {
  const e = normalizeEmail(email)
  if (!e) return false
  return getDirectorEmails().includes(e)
}

/**
 * Strict org role from email: only listed directors → OWNER (مجلس).
 * Everyone else → MEMBER (متطوع). Ignores any prior DB elevation.
 */
export function orgRoleForEmail(
  email: string | null | undefined,
  opts?: { userId?: string; allowSyntheticOwner?: boolean }
): Role {
  if (isDirectorEmail(email)) return 'OWNER'
  if (
    opts?.allowSyntheticOwner &&
    (opts.userId === 'local-owner' || opts.userId === 'user-1')
  ) {
    return 'OWNER'
  }
  return 'MEMBER'
}

export function personaForEmail(
  email: string | null | undefined,
  opts?: { userId?: string; allowSyntheticOwner?: boolean }
): UiPersona {
  if (isDirectorEmail(email)) return 'director'
  if (
    opts?.allowSyntheticOwner &&
    (opts.userId === 'local-owner' || opts.userId === 'user-1')
  ) {
    return 'director'
  }
  return 'employee'
}

/** Association-domain badge for the signed-in email. */
export function labelArForEmail(
  email: string | null | undefined,
  opts?: { userId?: string; allowSyntheticOwner?: boolean }
): string {
  return personaForEmail(email, opts) === 'director'
    ? 'مجلس'
    : 'متطوع'
}

/** Room membership mirroring the same strict email rule. */
export function roomRoleForEmail(
  email: string | null | undefined
): 'owner' | 'member' {
  return isDirectorEmail(email) ? 'owner' : 'member'
}
