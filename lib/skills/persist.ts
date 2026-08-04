import { prisma, withPrismaFallback } from '@/lib/db'
import type { OpenClawSkill } from '@/lib/skills/openclaw'
import {
  loadAllOpenClawSkills,
  saveSkillToWorkspace,
  serializeOpenClawSkill,
} from '@/lib/skills/openclaw'

export type SkillStatus = 'ACTIVE' | 'PENDING_REVIEW' | 'REJECTED'

async function ensureSkillsTable(): Promise<void> {
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS workspace_skills (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          scope TEXT NOT NULL,
          author TEXT,
          system_instructions TEXT NOT NULL,
          tools_required JSONB,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `),
    0
  )
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(`
        ALTER TABLE workspace_skills
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE'
      `),
    0
  )
}

export async function persistSkill(
  skill: OpenClawSkill,
  opts?: { status?: SkillStatus }
): Promise<void> {
  const status = opts?.status || 'ACTIVE'
  await ensureSkillsTable()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `INSERT INTO workspace_skills
          (id, name, description, scope, author, system_instructions, tools_required, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           scope = EXCLUDED.scope,
           author = EXCLUDED.author,
           system_instructions = EXCLUDED.system_instructions,
           tools_required = EXCLUDED.tools_required,
           status = EXCLUDED.status,
           updated_at = NOW()`,
        skill.id,
        skill.name,
        skill.description,
        skill.scope,
        skill.author || null,
        skill.systemInstructions,
        JSON.stringify(skill.toolsRequired || []),
        status
      ),
    0
  )
  if (status === 'ACTIVE') {
    try {
      saveSkillToWorkspace(skill)
    } catch {
      /* Netlify FS may be read-only — DB is source of truth */
    }
  }
}

function mapRow(r: {
  id: string
  name: string
  description: string
  scope: string
  author: string | null
  system_instructions: string
  tools_required: unknown
  status?: string
}): OpenClawSkill & { status?: SkillStatus } {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    scope: r.scope === 'personal' ? 'personal' : 'shared',
    author: r.author || undefined,
    systemInstructions: r.system_instructions,
    toolsRequired: Array.isArray(r.tools_required)
      ? (r.tools_required as string[])
      : undefined,
    status: (r.status as SkillStatus) || 'ACTIVE',
  }
}

export async function loadPersistedSkills(opts?: {
  status?: SkillStatus | 'ALL'
}): Promise<Array<OpenClawSkill & { status?: SkillStatus }>> {
  await ensureSkillsTable()
  const status = opts?.status || 'ACTIVE'
  const rows = await withPrismaFallback(
    () =>
      status === 'ALL'
        ? prisma.$queryRawUnsafe<
            Array<{
              id: string
              name: string
              description: string
              scope: string
              author: string | null
              system_instructions: string
              tools_required: unknown
              status: string
            }>
          >(`SELECT * FROM workspace_skills ORDER BY updated_at DESC`)
        : prisma.$queryRawUnsafe<
            Array<{
              id: string
              name: string
              description: string
              scope: string
              author: string | null
              system_instructions: string
              tools_required: unknown
              status: string
            }>
          >(
            `SELECT * FROM workspace_skills WHERE status = $1 ORDER BY updated_at DESC`,
            status
          ),
    []
  )
  return rows.map(mapRow)
}

export async function listPendingSkillProposals() {
  return loadPersistedSkills({ status: 'PENDING_REVIEW' })
}

export async function setSkillStatus(
  id: string,
  status: SkillStatus
): Promise<(OpenClawSkill & { status?: SkillStatus }) | null> {
  if (!id || id.includes('..') || id.includes('/')) return null
  await ensureSkillsTable()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `UPDATE workspace_skills SET status = $2, updated_at = NOW() WHERE id = $1`,
        id,
        status
      ),
    0
  )
  const rows = await withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<
        Array<{
          id: string
          name: string
          description: string
          scope: string
          author: string | null
          system_instructions: string
          tools_required: unknown
          status: string
        }>
      >(`SELECT * FROM workspace_skills WHERE id = $1`, id),
    []
  )
  const skill = rows[0] ? mapRow(rows[0]) : null
  if (skill && status === 'ACTIVE') {
    try {
      saveSkillToWorkspace(skill)
    } catch {
      /* ignore */
    }
  }
  return skill
}

export async function deletePersistedSkill(id: string): Promise<boolean> {
  if (!id || id.includes('..') || id.includes('/')) return false
  await ensureSkillsTable()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `DELETE FROM workspace_skills WHERE id = $1`,
        id
      ),
    0
  )
  return true
}

/** Merge filesystem + DB skills (DB wins on id conflict). Active only. */
export async function loadAllSkillsMerged(): Promise<OpenClawSkill[]> {
  const map = new Map<string, OpenClawSkill>()
  for (const s of loadAllOpenClawSkills()) map.set(s.id, s)
  for (const s of await loadPersistedSkills({ status: 'ACTIVE' })) {
    map.set(s.id, s)
  }
  return [...map.values()]
}

export { serializeOpenClawSkill }
