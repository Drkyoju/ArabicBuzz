import type { Role, UiPersona } from '@/lib/auth/rbac-types'

export type { Role, UiPersona } from '@/lib/auth/rbac-types'

/**
 * Association-domain Arabic badges (not SaaS jargon).
 * OWNER → مجلس · ADMIN → مدير تنفيذي · DEPARTMENT_MANAGER → عضو لجنة · …
 */
export const ROLE_LABEL_AR: Record<Role, string> = {
  OWNER: 'مجلس',
  ADMIN: 'مدير تنفيذي',
  DEPARTMENT_MANAGER: 'عضو لجنة',
  MEMBER: 'متطوع',
  AUDITOR: 'مدقق',
}

export const PERSONA_LABEL_AR: Record<UiPersona, string> = {
  admin: 'مجلس / إدارة',
  director: 'مدير تنفيذي',
  employee: 'عضو / متطوع',
}

/** Longer hint shown in settings / team panel. */
export const ROLE_HINT_AR: Record<Role, string> = {
  OWNER: 'مجلس الإدارة — اعتمادات وقرارات عليا',
  ADMIN: 'المدير التنفيذي — تشغيل يومي وملخص أسبوعي',
  DEPARTMENT_MANAGER: 'عضو لجنة — برامج / مالية / عضوية',
  MEMBER: 'متطوع أو عضو — مهام يومية',
  AUDITOR: 'مدقق — اطّلاع على السجل والتقارير',
}

export function roleToPersona(role: Role): UiPersona {
  if (role === 'OWNER' || role === 'ADMIN') return 'admin'
  if (role === 'DEPARTMENT_MANAGER') return 'director'
  return 'employee'
}

export function roleLabelAr(role: Role): string {
  return ROLE_LABEL_AR[role]
}

export function roleHintAr(role: Role): string {
  return ROLE_HINT_AR[role]
}

/**
 * Room membership → association-domain badge.
 * owner → مجلس · editor → مدير تنفيذي · member → عضو لجنة · viewer → متطوع
 */
export function roomRoleLabelAr(role: string): string {
  if (role === 'owner') return 'مجلس'
  if (role === 'editor') return 'مدير تنفيذي'
  if (role === 'member') return 'عضو لجنة'
  if (role === 'viewer') return 'متطوع'
  if (role === 'guest') return 'ضيف'
  return 'عضو'
}

/** Room role → whether this person gets director-level room powers. */
export function roomRoleIsDirector(role: string): boolean {
  return role === 'owner' || role === 'editor'
}
