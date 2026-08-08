import type { Role, UiPersona } from '@/lib/auth/rbac-types'

/**
 * Fallback sole workspace owner email — full admin UI only for this address
 * (or `OWNER_EMAIL` when set). Compare with normalizeEmail (case-insensitive).
 */
export const DEFAULT_DIRECTOR_EMAIL = 'ryodan71@gmail.com'

/**
 * Built-in employee allowlist (case-insensitive).
 * Merged with `EMPLOYEE_EMAILS` env (comma-separated). Never elevates to owner.
 */
export const DEFAULT_EMPLOYEE_EMAILS = [
  'hd.hk1444920@gmail.com',
  'hd.hk2023429@gmail.com',
] as const

export function normalizeEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase()
}

/**
 * Single source of truth for the product owner address.
 * `OWNER_EMAIL` env overrides the default; otherwise ryodan71@gmail.com.
 */
export function getWorkspaceOwnerEmail(): string {
  return normalizeEmail(process.env.OWNER_EMAIL) || DEFAULT_DIRECTOR_EMAIL
}

/**
 * True only for the sole workspace owner email (case-insensitive).
 * Room-owner role alone must never grant full admin UI.
 */
export function isWorkspaceOwnerEmail(
  email: string | null | undefined
): boolean {
  return normalizeEmail(email) === getWorkspaceOwnerEmail()
}

/**
 * Digest recipients only — never elevates admin UI.
 * Always includes the workspace owner; may add DIRECTOR_EMAIL(S) for mail.
 */
export function getDirectorEmails(): string[] {
  const fromList = (process.env.DIRECTOR_EMAILS || '')
    .split(',')
    .map((e) => normalizeEmail(e))
    .filter(Boolean)
  const legacy = normalizeEmail(process.env.DIRECTOR_EMAIL)
  const set = new Set<string>([getWorkspaceOwnerEmail(), ...fromList])
  if (legacy) set.add(legacy)
  return [...set]
}

/** Alias: elevated director / admin powers follow the sole workspace owner. */
export function isDirectorEmail(email: string | null | undefined): boolean {
  return isWorkspaceOwnerEmail(email)
}

/**
 * Recognized workspace employees (MEMBER / employee UI).
 * Defaults + `EMPLOYEE_EMAILS` env; owner email is never listed here.
 */
export function getEmployeeEmails(): string[] {
  const fromEnv = (process.env.EMPLOYEE_EMAILS || '')
    .split(',')
    .map((e) => normalizeEmail(e))
    .filter(Boolean)
  const owner = getWorkspaceOwnerEmail()
  const set = new Set<string>()
  for (const e of [...DEFAULT_EMPLOYEE_EMAILS, ...fromEnv]) {
    const n = normalizeEmail(e)
    if (n && n !== owner) set.add(n)
  }
  return [...set]
}

/** True when email is on the employee allowlist (not the owner). */
export function isAllowlistedEmployeeEmail(
  email: string | null | undefined
): boolean {
  const n = normalizeEmail(email)
  if (!n || n === getWorkspaceOwnerEmail()) return false
  return getEmployeeEmails().includes(n)
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
