/**
 * Team calendar is always the primary shared room — never a personal desk.
 * Personal Google calendar_* / personal-* scopes stay separate.
 */
import {
  isPersonalScopeId,
  isLegacySharedPersonalScope,
} from '@/lib/scopes/personal-desk'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'

/** Scope id for «تقويم الفريق» / Zoom upcoming / Telegram team agenda. */
export function teamCalendarScopeId(
  preferred?: string | null
): typeof PRIMARY_TEAM_SCOPE_ID | string {
  const raw = String(preferred || '').trim()
  if (!raw) return PRIMARY_TEAM_SCOPE_ID
  if (isLegacySharedPersonalScope(raw) || isPersonalScopeId(raw)) {
    return PRIMARY_TEAM_SCOPE_ID
  }
  // Hidden demos still share the association board.
  if (raw === 'shared-ops') return PRIMARY_TEAM_SCOPE_ID
  return raw.startsWith('shared-') ? raw : PRIMARY_TEAM_SCOPE_ID
}

export function isTeamCalendarScope(scopeId: string | null | undefined): boolean {
  const id = String(scopeId || '')
  return id === PRIMARY_TEAM_SCOPE_ID || id.startsWith('shared-')
}
