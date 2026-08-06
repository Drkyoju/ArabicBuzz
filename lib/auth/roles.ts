import type { Role, UiPersona } from '@/lib/auth/rbac-types'

/**
 * Sole workspace owner email — full admin UI only for this address.
 * Compare with normalizeEmail (case-insensitive).
 */
export const DEFAULT_DIRECTOR_EMAIL = 'ryodan71@gmail.com'

export function normalizeEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase()
}

/**
 * True only for ryodan71@gmail.com (case-insensitive).
 * Room-owner role alone must never grant full admin UI.
 */
export function isWorkspaceOwnerEmail(
  email: string | null | undefined
): boolean {
  return normalizeEmail(email) === DEFAULT_DIRECTOR_EMAIL
}

/**
 * Director allow-list for digests / legacy callers.
 * Product owner UI still requires {@link isWorkspaceOwnerEmail}.
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

/** Alias: elevated director powers follow the sole workspace owner email. */
export function isDirectorEmail(email: string | null | undefined): boolean {
  return isWorkspaceOwnerEmail(email)
}

/**
 * Strict org role from email: only workspace owner → OWNER (مجلس).
 * Everyone else → MEMBER (متطوع). Ignores room role and prior DB elevation.
 */
export function orgRoleForEmail(
  email: string | null | undefined,
  opts?: { userId?: string; allowSyntheticOwner?: boolean }
): Role {
  if (isWorkspaceOwnerEmail(email)) return 'OWNER'
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
  if (isWorkspaceOwnerEmail(email)) return 'director'
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
  return isWorkspaceOwnerEmail(email) ? 'owner' : 'member'
}
