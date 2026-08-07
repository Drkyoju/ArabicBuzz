import { prisma, withPrismaFallback } from '@/lib/db'
import type { AgentRosterPayload } from '@/lib/rooms/roster-types'
import {
  exportScopeRosterSlice,
  usesSharedRoomRoster,
} from '@/lib/rooms/roster-scope'

export type { AgentRosterPayload } from '@/lib/rooms/roster-types'

async function ensureUserTable(): Promise<void> {
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS user_agent_rosters (
          user_id text PRIMARY KEY,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `),
    0
  )
}

async function ensureScopeTable(): Promise<void> {
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS scope_agent_rosters (
          scope_id text PRIMARY KEY,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_by text,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `),
    0
  )
}

function normalizePayload(raw: unknown): AgentRosterPayload {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<AgentRosterPayload>
  return {
    customAgents: Array.isArray(o.customAgents) ? o.customAgents : [],
    removedFromScope:
      o.removedFromScope && typeof o.removedFromScope === 'object'
        ? o.removedFromScope
        : {},
    addedToScope:
      o.addedToScope && typeof o.addedToScope === 'object' ? o.addedToScope : {},
    collabModeByScope:
      o.collabModeByScope && typeof o.collabModeByScope === 'object'
        ? o.collabModeByScope
        : {},
    agentsEnabledByScope:
      o.agentsEnabledByScope && typeof o.agentsEnabledByScope === 'object'
        ? o.agentsEnabledByScope
        : {},
    agentOverrides:
      o.agentOverrides && typeof o.agentOverrides === 'object'
        ? o.agentOverrides
        : {},
  }
}

export async function loadUserAgentRoster(
  userId: string
): Promise<AgentRosterPayload | null> {
  await ensureUserTable()
  const rows = await withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<Array<{ payload: unknown }>>(
        `SELECT payload FROM user_agent_rosters WHERE user_id = $1 LIMIT 1`,
        userId
      ),
    []
  )
  if (!rows[0]) return null
  return normalizePayload(rows[0].payload)
}

export async function saveUserAgentRoster(
  userId: string,
  payload: AgentRosterPayload
): Promise<void> {
  await ensureUserTable()
  const normalized = normalizePayload(payload)
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `INSERT INTO user_agent_rosters (user_id, payload, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
        userId,
        JSON.stringify(normalized)
      ),
    0
  )
}

export async function loadScopeAgentRoster(
  scopeId: string
): Promise<AgentRosterPayload | null> {
  await ensureScopeTable()
  const rows = await withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<Array<{ payload: unknown }>>(
        `SELECT payload FROM scope_agent_rosters WHERE scope_id = $1 LIMIT 1`,
        scopeId
      ),
    []
  )
  if (!rows[0]) return null
  return normalizePayload(rows[0].payload)
}

export async function saveScopeAgentRoster(
  scopeId: string,
  payload: AgentRosterPayload,
  updatedBy?: string
): Promise<void> {
  await ensureScopeTable()
  const slice = exportScopeRosterSlice(scopeId, normalizePayload(payload))
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `INSERT INTO scope_agent_rosters (scope_id, payload, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (scope_id) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        scopeId,
        JSON.stringify(slice),
        updatedBy || null
      ),
    0
  )
}

/**
 * Load roster for a room: shared scopes → scope row (seed from user once);
 * personal desks → per-user row.
 */
export async function loadRosterForScope(opts: {
  scopeId: string
  userId: string
}): Promise<{
  payload: AgentRosterPayload | null
  shared: boolean
  synced: boolean
}> {
  const shared = usesSharedRoomRoster(opts.scopeId)
  if (!shared) {
    const payload = await loadUserAgentRoster(opts.userId)
    return { payload, shared: false, synced: Boolean(payload) }
  }

  let payload = await loadScopeAgentRoster(opts.scopeId)
  if (!payload) {
    const userPayload = await loadUserAgentRoster(opts.userId)
    if (userPayload) {
      const seed = exportScopeRosterSlice(opts.scopeId, userPayload)
      const hasSeed =
        seed.customAgents.length > 0 ||
        (seed.addedToScope[opts.scopeId] || []).length > 0 ||
        (seed.removedFromScope[opts.scopeId] || []).length > 0 ||
        seed.collabModeByScope[opts.scopeId] != null ||
        seed.agentsEnabledByScope?.[opts.scopeId] !== undefined
      if (hasSeed) {
        await saveScopeAgentRoster(opts.scopeId, seed, opts.userId)
        payload = seed
      }
    }
  }
  return { payload, shared: true, synced: Boolean(payload) }
}

export async function saveRosterForScope(opts: {
  scopeId: string
  userId: string
  payload: AgentRosterPayload
}): Promise<{ shared: boolean }> {
  const shared = usesSharedRoomRoster(opts.scopeId)
  if (shared) {
    await saveScopeAgentRoster(opts.scopeId, opts.payload, opts.userId)
    return { shared: true }
  }
  await saveUserAgentRoster(opts.userId, opts.payload)
  return { shared: false }
}
