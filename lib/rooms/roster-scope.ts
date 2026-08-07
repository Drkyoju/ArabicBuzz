/**
 * Shared team rooms store one agent roster for all members.
 * Personal desks stay per-user (same demo scope id across accounts).
 */

import { SCOPE_AGENT_IDS, type RoomAgent } from '@/lib/rooms/agents'
import type { AgentRosterPayload } from '@/lib/rooms/roster-types'

/** Personal desk ids — roster remains per signed-in user. */
const PERSONAL_ROSTER_SCOPE_IDS = new Set([
  'personal-demo',
  'personal-research',
])

export function usesSharedRoomRoster(scopeId: string): boolean {
  if (!scopeId) return false
  if (PERSONAL_ROSTER_SCOPE_IDS.has(scopeId)) return false
  if (scopeId.startsWith('personal-')) return false
  return true
}

/**
 * Shared team rooms always keep agents present and ready.
 * Personal desks may still pause agent replies («محادثة فقط»).
 */
export function agentsAlwaysPresentInRoom(scopeId: string): boolean {
  return usesSharedRoomRoster(scopeId)
}

/** Slice a full client payload down to one room (for shared DB row). */
export function exportScopeRosterSlice(
  scopeId: string,
  full: AgentRosterPayload
): AgentRosterPayload {
  const removed = full.removedFromScope?.[scopeId] || []
  const added = full.addedToScope?.[scopeId] || []
  const base = SCOPE_AGENT_IDS[scopeId] || []
  const seated = new Set([
    ...base.filter((id) => !removed.includes(id)),
    ...added.filter((id) => !removed.includes(id)),
  ])
  const customAgents = (full.customAgents || []).filter((a) => seated.has(a.id))
  const overrides: AgentRosterPayload['agentOverrides'] = {}
  for (const [id, patch] of Object.entries(full.agentOverrides || {})) {
    if (seated.has(id) || customAgents.some((a) => a.id === id)) {
      overrides[id] = patch
    }
  }
  const collab = full.collabModeByScope?.[scopeId]
  const enabled = agentsAlwaysPresentInRoom(scopeId)
    ? true
    : full.agentsEnabledByScope?.[scopeId]
  return {
    customAgents,
    removedFromScope: { [scopeId]: removed },
    addedToScope: { [scopeId]: added },
    collabModeByScope: collab ? { [scopeId]: collab } : {},
    agentsEnabledByScope:
      enabled === undefined ? {} : { [scopeId]: enabled },
    agentOverrides: overrides,
  }
}

/** Merge a room slice into the local full roster without wiping other rooms. */
export function mergeScopeRosterSlice(
  scopeId: string,
  current: AgentRosterPayload,
  slice: AgentRosterPayload
): AgentRosterPayload {
  const customById = new Map<string, RoomAgent>()
  for (const a of current.customAgents || []) customById.set(a.id, a)
  for (const a of slice.customAgents || []) customById.set(a.id, a)

  return {
    customAgents: [...customById.values()],
    removedFromScope: {
      ...current.removedFromScope,
      [scopeId]: slice.removedFromScope?.[scopeId] || [],
    },
    addedToScope: {
      ...current.addedToScope,
      [scopeId]: slice.addedToScope?.[scopeId] || [],
    },
    collabModeByScope: {
      ...current.collabModeByScope,
      ...(slice.collabModeByScope?.[scopeId] != null
        ? { [scopeId]: slice.collabModeByScope[scopeId] }
        : {}),
    },
    agentsEnabledByScope: {
      ...current.agentsEnabledByScope,
      ...(slice.agentsEnabledByScope?.[scopeId] !== undefined
        ? { [scopeId]: Boolean(slice.agentsEnabledByScope[scopeId]) }
        : {}),
    },
    agentOverrides: {
      ...current.agentOverrides,
      ...(slice.agentOverrides || {}),
    },
  }
}
