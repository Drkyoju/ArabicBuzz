import type { ActiveScopeContext } from '@/lib/scopes/types'
import type { OpenClawSkill } from '@/lib/skills/openclaw'
import { loadAllSkillsMerged } from '@/lib/skills/persist'
import { buildPromptContext } from '@/lib/scopes/manager'

export async function loadSkillsForScope(
  ctx: ActiveScopeContext
): Promise<OpenClawSkill[]> {
  const all = await loadAllSkillsMerged()
  return all.filter((skill) => {
    if (ctx.kind === 'personal' && skill.scope === 'shared') return false
    if (ctx.kind === 'shared' && skill.scope === 'personal') return false
    if (ctx.kind === 'shared' && ctx.allowedSkills?.length) {
      return (
        ctx.allowedSkills.includes(skill.id) ||
        ctx.allowedSkills.includes(skill.name)
      )
    }
    return skill.scope === ctx.kind || ctx.kind === 'shared'
  })
}

export function appendSkillsToSystemPrompt(
  baseSystemPrompt: string,
  skills: OpenClawSkill[]
): string {
  if (!skills.length) return baseSystemPrompt
  const blocks = skills
    .map(
      (s) => `## Skill: ${s.name}\n${s.description}\n\n${s.systemInstructions}`
    )
    .join('\n\n')
  return `${baseSystemPrompt}\n\n${blocks}`
}

export async function buildScopedSystemPrompt(
  baseSystemPrompt: string,
  ctx: ActiveScopeContext
): Promise<string> {
  const withMemory = `${baseSystemPrompt}\n\n${buildPromptContext(ctx)}`
  return appendSkillsToSystemPrompt(withMemory, await loadSkillsForScope(ctx))
}

export async function runSkillAugmentation(
  ctx: ActiveScopeContext,
  basePrompt: string
): Promise<string> {
  return buildScopedSystemPrompt(basePrompt, ctx)
}
