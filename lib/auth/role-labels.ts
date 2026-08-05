import type { Role, UiPersona } from '@/lib/auth/rbac-types'

export type { Role, UiPersona } from '@/lib/auth/rbac-types'

/** Short Arabic badge for each org role. */
export const ROLE_LABEL_AR: Record<Role, string> = {
  OWNER: 'مسؤول',
  ADMIN: 'مسؤول',
  DEPARTMENT_MANAGER: 'مدير',
  MEMBER: 'موظف',
  AUDITOR: 'موظف',
}

export const PERSONA_LABEL_AR: Record<UiPersona, string> = {
  admin: 'مسؤول',
  director: 'مدير',
  employee: 'موظف',
}

export function roleToPersona(role: Role): UiPersona {
  if (role === 'OWNER' || role === 'ADMIN') return 'admin'
  if (role === 'DEPARTMENT_MANAGER') return 'director'
  return 'employee'
}

export function roleLabelAr(role: Role): string {
  return ROLE_LABEL_AR[role]
}

/** Room membership → Arabic badge (owner/editor ≈ مدير، member ≈ موظف). */
export function roomRoleLabelAr(role: string): string {
  if (role === 'owner' || role === 'editor') return 'مدير'
  if (role === 'viewer' || role === 'guest') return 'موظف'
  return 'موظف'
}

/** Room role → whether this person gets director-level room powers. */
export function roomRoleIsDirector(role: string): boolean {
  return role === 'owner' || role === 'editor'
}
