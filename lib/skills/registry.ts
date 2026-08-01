import type { ActiveScopeContext } from '@/lib/scopes/types'
import {
  OpenClawSkill,
  loadAllOpenClawSkills,
} from '@/lib/skills/openclaw'
import { buildPromptContext } from '@/lib/scopes/manager'

export function loadSkillsForScope(ctx: ActiveScopeContext): OpenClawSkill[] {
  const all = loadAllOpenClawSkills()
  return all.filter((skill) => {
    const scopeOk =
      skill.scope === ctx.kind ||
      (skill as OpenClawSkill & { scope?: string }).scope === undefined
    if (!scopeOk && skill.scope !== ctx.kind) {
      // allow personal skills only in personal; shared in shared
      if (ctx.kind === 'personal' && skill.scope === 'shared') return false
      if (ctx.kind === 'shared' && skill.scope === 'personal') return false
    }
    if (ctx.kind === 'shared' && ctx.allowedSkills?.length) {
      return ctx.allowedSkills.includes(skill.id) || ctx.allowedSkills.includes(skill.name)
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

export function buildScopedSystemPrompt(
  baseSystemPrompt: string,
  ctx: ActiveScopeContext
): string {
  const withMemory = `${baseSystemPrompt}\n\n${buildPromptContext(ctx)}`
  return appendSkillsToSystemPrompt(withMemory, loadSkillsForScope(ctx))
}

export function runSkillAugmentation(
  ctx: ActiveScopeContext,
  basePrompt: string
): string {
  return buildScopedSystemPrompt(basePrompt, ctx)
}
