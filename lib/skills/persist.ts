import { prisma, withPrismaFallback } from '@/lib/db'
import type { OpenClawSkill } from '@/lib/skills/openclaw'
import {
  loadAllOpenClawSkills,
  saveSkillToWorkspace,
  serializeOpenClawSkill,
} from '@/lib/skills/openclaw'

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
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `),
    0
  )
}

export async function persistSkill(skill: OpenClawSkill): Promise<void> {
  await ensureSkillsTable()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `INSERT INTO workspace_skills
          (id, name, description, scope, author, system_instructions, tools_required, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           scope = EXCLUDED.scope,
           author = EXCLUDED.author,
           system_instructions = EXCLUDED.system_instructions,
           tools_required = EXCLUDED.tools_required,
           updated_at = NOW()`,
        skill.id,
        skill.name,
        skill.description,
        skill.scope,
        skill.author || null,
        skill.systemInstructions,
        JSON.stringify(skill.toolsRequired || [])
      ),
    0
  )
  try {
    saveSkillToWorkspace(skill)
  } catch {
    /* Netlify FS may be read-only — DB is source of truth */
  }
}

export async function loadPersistedSkills(): Promise<OpenClawSkill[]> {
  await ensureSkillsTable()
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
        }>
      >(`SELECT * FROM workspace_skills ORDER BY updated_at DESC`),
    []
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    scope: r.scope === 'personal' ? 'personal' : 'shared',
    author: r.author || undefined,
    systemInstructions: r.system_instructions,
    toolsRequired: Array.isArray(r.tools_required)
      ? (r.tools_required as string[])
      : undefined,
  }))
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

/** Merge filesystem + DB skills (DB wins on id conflict). */
export async function loadAllSkillsMerged(): Promise<OpenClawSkill[]> {
  const map = new Map<string, OpenClawSkill>()
  for (const s of loadAllOpenClawSkills()) map.set(s.id, s)
  for (const s of await loadPersistedSkills()) map.set(s.id, s)
  return [...map.values()]
}

export { serializeOpenClawSkill }
