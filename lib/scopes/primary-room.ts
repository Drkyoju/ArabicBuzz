/**
 * Product UX: one primary shared room (staff + agents) + one private desk per user.
 * Extra demo rooms stay in data for invites/compat but are hidden from the sidebar.
 */

import {
  isPersonalScopeId,
  isPinnedPersonalDesk,
  LEGACY_PERSONAL_DESK_SCOPE_ID,
  personalDeskScopeId,
} from '@/lib/scopes/personal-desk'

export const PRIMARY_TEAM_SCOPE_ID = 'shared-demo'
/** @deprecated Use personalDeskScopeId(userId) — kept for localStorage / redirect compat. */
export const PERSONAL_DESK_SCOPE_ID = LEGACY_PERSONAL_DESK_SCOPE_ID

export { personalDeskScopeId, isPinnedPersonalDesk }

/** Demo rooms kept for data/compat — not shown as primary sidebar clutter. */
export const HIDDEN_DEMO_SCOPE_IDS = new Set([
  'personal-research',
  'shared-ops',
])

export function isPrimaryTeamScope(scopeId: string): boolean {
  return scopeId === PRIMARY_TEAM_SCOPE_ID
}

export function isPinnedSidebarScope(
  scopeId: string,
  userId?: string | null
): boolean {
  return (
    scopeId === PRIMARY_TEAM_SCOPE_ID || isPinnedPersonalDesk(scopeId, userId)
  )
}

/** True when an old/clutter demo room should redirect to the team room. */
export function shouldRedirectToPrimary(scopeId: string | null | undefined): boolean {
  if (!scopeId) return true
  return HIDDEN_DEMO_SCOPE_IDS.has(scopeId)
}

/** Legacy shared personal bucket → caller's private desk. */
export function shouldRedirectLegacyPersonalDesk(
  scopeId: string | null | undefined,
  userId?: string | null
): string | null {
  if (!scopeId || !userId) return null
  if (scopeId === LEGACY_PERSONAL_DESK_SCOPE_ID) {
    return personalDeskScopeId(userId)
  }
  return null
}

export function ensurePrimaryTeamScope(): string {
  return PRIMARY_TEAM_SCOPE_ID
}

export function isPrivatePersonalRoom(scopeId: string): boolean {
  return isPersonalScopeId(scopeId)
}
