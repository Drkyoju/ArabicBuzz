/** Shared role types — safe for client and server. */

export type Role =
  | 'OWNER'
  | 'ADMIN'
  | 'DEPARTMENT_MANAGER'
  | 'MEMBER'
  | 'AUDITOR'

/**
 * Product-facing personas shown in the UI (MSA labels).
 * Maps onto org RBAC: admin←OWNER|ADMIN, director←DEPARTMENT_MANAGER, employee←MEMBER|AUDITOR.
 */
export type UiPersona = 'admin' | 'director' | 'employee'
