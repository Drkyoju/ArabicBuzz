/**
 * Product UX: one primary shared room (staff + agents).
 * Extra demo rooms stay in data for invites/compat but are hidden from the sidebar.
 */

export const PRIMARY_TEAM_SCOPE_ID = 'shared-demo'
export const PERSONAL_DESK_SCOPE_ID = 'personal-demo'

/** Demo rooms kept for data/compat — not shown as primary sidebar clutter. */
export const HIDDEN_DEMO_SCOPE_IDS = new Set([
  'personal-research',
  'shared-ops',
])

export function isPrimaryTeamScope(scopeId: string): boolean {
  return scopeId === PRIMARY_TEAM_SCOPE_ID
}

export function isPinnedSidebarScope(scopeId: string): boolean {
  return (
    scopeId === PRIMARY_TEAM_SCOPE_ID || scopeId === PERSONAL_DESK_SCOPE_ID
  )
}

/** True when an old/clutter demo room should redirect to the team room. */
export function shouldRedirectToPrimary(scopeId: string | null | undefined): boolean {
  if (!scopeId) return true
  return HIDDEN_DEMO_SCOPE_IDS.has(scopeId)
}

export function ensurePrimaryTeamScope(): string {
  return PRIMARY_TEAM_SCOPE_ID
}
