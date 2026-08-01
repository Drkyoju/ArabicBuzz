import { prisma, withPrismaFallback } from '@/lib/db'

export type Role =
  | 'OWNER'
  | 'ADMIN'
  | 'DEPARTMENT_MANAGER'
  | 'MEMBER'
  | 'AUDITOR'

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
 */
export async function hasPermission(
  userId: string,
  orgId: string,
  requiredRole: Role
): Promise<boolean> {
  if (!userId?.trim() || !orgId?.trim()) return false
  const role = await getMemberRole(userId, orgId)
  if (!role) return false
  return ROLE_RANK[role] >= ROLE_RANK[requiredRole]
}

export async function assertPermission(
  userId: string,
  orgId: string,
  requiredRole: Role
): Promise<void> {
  const ok = await hasPermission(userId, orgId, requiredRole)
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

/** Minimum roles for sensitive product actions. */
export const SENSITIVE_ACTION_ROLES = {
  deleteThread: 'ADMIN' as Role,
  installSkill: 'DEPARTMENT_MANAGER' as Role,
  approveHighRisk: 'ADMIN' as Role,
} as const
