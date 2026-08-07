import { prisma, withPrismaFallback } from '@/lib/db'
import type { Role, UiPersona } from '@/lib/auth/rbac-types'
import {
  PERSONA_LABEL_AR,
  ROLE_LABEL_AR,
  roleLabelAr,
  roleToPersona,
  roomRoleIsDirector,
  roomRoleLabelAr,
} from '@/lib/auth/role-labels'
import {
  isDirectorEmail,
  isWorkspaceOwnerEmail,
  labelArForEmail,
  orgRoleForEmail,
  personaForEmail,
  roomRoleForEmail,
} from '@/lib/auth/roles'

export type { Role, UiPersona }
export {
  PERSONA_LABEL_AR,
  ROLE_LABEL_AR,
  roleLabelAr,
  roleToPersona,
  roomRoleIsDirector,
  roomRoleLabelAr,
  isDirectorEmail,
  isWorkspaceOwnerEmail,
  labelArForEmail,
  orgRoleForEmail,
  personaForEmail,
  roomRoleForEmail,
}

export const ARABIC_AUTHZ_ERROR =
  'عفواً، لا تملك الصلاحية الكافية لتنفيذ هذا الإجراء.'

/** Higher number = more privilege. */
export const ROLE_RANK: Record<Role, number> = {
  AUDITOR: 1,
  MEMBER: 2,
  DEPARTMENT_MANAGER: 3,
  ADMIN: 4,
  OWNER: 5,
}

export const ROLES: Role[] = [
  'OWNER',
  'ADMIN',
  'DEPARTMENT_MANAGER',
  'MEMBER',
  'AUDITOR',
]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role)
}

/** Directors and admins may open the full ops / integrations shell. */
export function canAccessOpsUi(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.DEPARTMENT_MANAGER
}

/** Map invite/settings persona pickers → org Role (defaults to volunteer/member). */
export function personaToRole(persona: string): Role {
  const p = persona.trim().toLowerCase()
  if (
    p === 'admin' ||
    p === 'مسؤول' ||
    p === 'owner' ||
    p === 'مجلس' ||
    p.includes('مجلس')
  ) {
    return 'OWNER'
  }
  if (
    p === 'director' ||
    p === 'مدير' ||
    p === 'manager' ||
    p.includes('تنفيذي')
  ) {
    return 'ADMIN'
  }
  if (p.includes('لجنة') || p === 'department_manager') {
    return 'DEPARTMENT_MANAGER'
  }
  if (p.includes('مدقق') || p === 'auditor') return 'AUDITOR'
  return 'MEMBER'
}

export class AuthorizationError extends Error {
  readonly status = 403
  readonly code = 'INSUFFICIENT_PERMISSIONS'

  constructor(message: string = ARABIC_AUTHZ_ERROR) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

const memoryMemberships = new Map<string, { role: Role }>()

function memKey(userId: string, orgId: string) {
  return `${userId}::${orgId}`
}

/** Seed / override membership for demos & tests when Postgres is down. */
export function seedOrgMembership(
  userId: string,
  orgId: string,
  role: Role
): void {
  memoryMemberships.set(memKey(userId, orgId), { role })
}

seedOrgMembership('user-1', 'org-demo', 'OWNER')
seedOrgMembership('local-owner', 'org-demo', 'OWNER')

export async function getMemberRole(
  userId: string,
  orgId: string
): Promise<Role | null> {
  const fromDb = await withPrismaFallback(async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ role: string }>>(
      `
      SELECT role::text AS role
      FROM organization_members
      WHERE user_id = $1 AND org_id = $2
      LIMIT 1
      `,
      userId,
      orgId
    )
    const role = rows[0]?.role
    return isRole(role) ? role : null
  }, null)

  if (fromDb) return fromDb
  return memoryMemberships.get(memKey(userId, orgId))?.role ?? null
}

/**
 * Returns true when the member's role is at least as privileged as `requiredRole`.
 * When `email` is provided, the director allow-list is the source of truth.
 */
function isSyntheticServicePrincipal(userId: string): boolean {
  return userId === 'user-1' || userId === 'local-owner'
}

export async function hasPermission(
  userId: string,
  orgId: string,
  requiredRole: Role,
  email?: string | null
): Promise<boolean> {
  if (!userId?.trim() || !orgId?.trim()) return false
  if (email !== undefined) {
    const role = orgRoleForEmail(email, {
      userId,
      allowSyntheticOwner: isSyntheticServicePrincipal(userId),
    })
    return ROLE_RANK[role] >= ROLE_RANK[requiredRole]
  }
  const role = await getMemberRole(userId, orgId)
  if (!role) return false
  // Telegram / local service principals are seeded OWNER — trust them without email.
  if (isSyntheticServicePrincipal(userId)) {
    return ROLE_RANK[role] >= ROLE_RANK[requiredRole]
  }
  // Without email, do not trust elevated DB rows (stale directors).
  if (ROLE_RANK[role] >= ROLE_RANK.DEPARTMENT_MANAGER) return false
  return ROLE_RANK[role] >= ROLE_RANK[requiredRole]
}

export async function assertPermission(
  userId: string,
  orgId: string,
  requiredRole: Role,
  email?: string | null
): Promise<void> {
  const ok = await hasPermission(userId, orgId, requiredRole, email)
  if (!ok) {
    throw new AuthorizationError(ARABIC_AUTHZ_ERROR)
  }
}

/**
 * Bind RLS session vars for the current transaction/connection.
 * Call before Prisma queries that touch RLS-protected tables.
 */
export async function setRlsContext(opts: {
  userId: string
  orgId: string
}): Promise<void> {
  await prisma.$executeRawUnsafe(
    `SELECT set_config('app.current_user_id', $1, true)`,
    opts.userId
  )
  await prisma.$executeRawUnsafe(
    `SELECT set_config('app.current_org_id', $1, true)`,
    opts.orgId
  )
}

export async function withRlsContext<T>(
  opts: { userId: string; orgId: string },
  fn: () => Promise<T>
): Promise<T> {
  await setRlsContext(opts)
  return fn()
}

/**
 * Upsert org membership role.
 * When `email` is provided, the role is forced from the director allow-list
 * (Ryodan71 → OWNER; everyone else → MEMBER) — no self-promotion.
 */
export async function setOrgMemberRole(
  userId: string,
  orgId: string,
  role: Role,
  opts?: { email?: string | null }
): Promise<{ ok: true; role: Role } | { ok: false; error: string }> {
  if (!userId?.trim() || !orgId?.trim() || !isRole(role)) {
    return { ok: false, error: 'معطيات الدور غير صالحة' }
  }

  let next: Role = role
  if (opts && 'email' in opts) {
    next = orgRoleForEmail(opts.email, { userId })
  } else if (ROLE_RANK[role] >= ROLE_RANK.DEPARTMENT_MANAGER) {
    // Strict: cannot elevate without proving a director email.
    return {
      ok: false,
      error: 'تعيين المدير محصور على البريد المعتمد فقط.',
    }
  } else {
    next = 'MEMBER'
  }

  seedOrgMembership(userId, orgId, next)
  const saved = await withPrismaFallback(async () => {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO organization_members (id, user_id, org_id, role)
      VALUES (gen_random_uuid()::text, $1, $2, $3::org_role)
      ON CONFLICT (user_id, org_id)
      DO UPDATE SET role = EXCLUDED.role
      `,
      userId,
      orgId,
      next
    )
    return true
  }, false)
  if (!saved) {
    // Memory seed already applied — fine for demos / offline.
    return { ok: true, role: next }
  }
  return { ok: true, role: next }
}

/**
 * Sync org membership from the signed-in email (call on login / role GET).
 * Overrides stale director/admin rows for non-director emails.
 */
export async function syncOrgRoleFromEmail(
  userId: string,
  orgId: string,
  email: string | null | undefined,
  opts?: { allowSyntheticOwner?: boolean }
): Promise<Role> {
  const role = orgRoleForEmail(email, {
    userId,
    allowSyntheticOwner: opts?.allowSyntheticOwner,
  })
  if (
    opts?.allowSyntheticOwner &&
    (userId === 'local-owner' || userId === 'user-1') &&
    !isDirectorEmail(email)
  ) {
    seedOrgMembership(userId, orgId, 'OWNER')
    return 'OWNER'
  }
  const result = await setOrgMemberRole(userId, orgId, role, {
    email: email ?? null,
  })
  return result.ok ? result.role : role
}

/** Minimum roles for sensitive product actions. */
export const SENSITIVE_ACTION_ROLES = {
  deleteThread: 'ADMIN' as Role,
  /** Catalog install is owner-email gated in API; role floor kept OWNER. */
  installSkill: 'OWNER' as Role,
  /** Any signed-in org member may resolve HITL (director email still elevates). */
  approveHighRisk: 'MEMBER' as Role,
} as const
