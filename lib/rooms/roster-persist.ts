import { prisma, withPrismaFallback } from '@/lib/db'
import type { AgentRosterPayload } from '@/lib/rooms/roster-types'

export type { AgentRosterPayload } from '@/lib/rooms/roster-types'

async function ensureTable(): Promise<void> {
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
    agentOverrides:
      o.agentOverrides && typeof o.agentOverrides === 'object'
        ? o.agentOverrides
        : {},
  }
}

export async function loadUserAgentRoster(
  userId: string
): Promise<AgentRosterPayload | null> {
  await ensureTable()
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
  await ensureTable()
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
