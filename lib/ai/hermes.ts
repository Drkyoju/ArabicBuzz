import { generateText } from 'ai'
import { getHarnessModel } from '@/lib/ai/router'
import {
  OpenClawSkill,
  parseSkillFile,
  saveSkillToWorkspace,
} from '@/lib/skills/openclaw'

export type ThreadMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const META_PROMPT =
  'تحليل هذه المحادثة واستخراج المهارة الإجرائية الناتجة وتنسيقها كملف SKILL.md باللغة العربية.'

export async function distillThreadToSkill(
  threadMessages: ThreadMessage[],
  opts?: {
    scope?: 'personal' | 'shared'
    modelSlug?: string
    /** When false, only return the draft (default true for legacy). */
    persist?: boolean
  }
): Promise<OpenClawSkill> {
  const modelSlug =
    opts?.modelSlug || process.env.HERMES_MODEL || 'gemini-3.1-pro'
  const transcript = threadMessages
    .map((m) => `[${m.role}] ${m.content}`)
    .join('\n\n')

  const { text } = await generateText({
    model: getHarnessModel(modelSlug),
    system: META_PROMPT,
    prompt: transcript,
  })

  const skill = parseSkillFile(text)
  if (opts?.scope) skill.scope = opts.scope
  if (opts?.persist !== false) {
    try {
      saveSkillToWorkspace(skill)
    } catch {
      /* ignore */
    }
  }
  return skill
}
