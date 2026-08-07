import type { ActiveScopeContext } from '@/lib/scopes/types'
import type { OpenClawSkill } from '@/lib/skills/openclaw'
import { loadAllSkillsMerged } from '@/lib/skills/persist'
import { buildPromptContext } from '@/lib/scopes/manager'
import {
  CORE_AUTO_SKILL_IDS,
  isCoreAutoSkill,
} from '@/lib/skills/core-pack'

export async function loadSkillsForScope(
  ctx: ActiveScopeContext
): Promise<OpenClawSkill[]> {
  const all = await loadAllSkillsMerged()
  return all.filter((skill) => {
    // Core pack is always available to rooms, personal desks, assistants, Telegram.
    if (isCoreAutoSkill(skill.id)) return true
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
  const coreSet = new Set<string>(CORE_AUTO_SKILL_IDS)
  const ordered = [
    ...skills.filter((s) => coreSet.has(s.id)),
    ...skills.filter((s) => !coreSet.has(s.id)),
  ]
  const blocks = ordered
    .map(
      (s) => `## Skill: ${s.name}\n${s.description}\n\n${s.systemInstructions}`
    )
    .join('\n\n')
  return `${baseSystemPrompt}\n\n# مهارات مفعّلة تلقائياً\nاستخدم المهارة المناسبة تلقائياً عند تطابق الطلب — لا تطلب من المستخدم اختيار مهارة من قائمة.\n\n${blocks}`
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

/** Minimal scope context for assistants / one-shot runs (core skills always inject). */
export function scopeCtxForAssistant(
  scopeId: string,
  userId: string
): ActiveScopeContext {
  const personal = scopeId.startsWith('personal')
  if (personal) {
    return {
      kind: 'personal',
      scope: {
        id: scopeId,
        userId,
        nameAr: 'مساحة شخصية',
        keychain: {},
        privateMemory: [],
      },
      memory: [],
      userId,
    }
  }
  return {
    kind: 'shared',
    scope: {
      id: scopeId,
      nameAr: 'غرفة العمل',
      members: [],
      memberLabelsAr: [],
      agentLabelsAr: [],
      sharedMemory: [],
      skills: [...CORE_AUTO_SKILL_IDS],
    },
    memory: [],
    allowedSkills: [...CORE_AUTO_SKILL_IDS],
    userId,
  }
}
