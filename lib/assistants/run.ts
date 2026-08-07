import { listGoogleAccounts } from '@/lib/google/tokens'
import { isImapConfigured } from '@/lib/email/imap-store'
import { runAgentEngine } from '@/lib/agents/engine'
import { getAssistant } from '@/lib/assistants/catalog'
import type {
  AssistantId,
  AssistantRunResult,
} from '@/lib/assistants/types'
import type { SecurityPostureMode } from '@/lib/security/posture'
import {
  buildScopedSystemPrompt,
  scopeCtxForAssistant,
} from '@/lib/skills/registry'

export type RunAssistantInput = {
  assistantId: string
  /** User outcome in Arabic (or edited starter). */
  message: string
  scopeId: string
  requesterId: string
  mode?: SecurityPostureMode
  /** Skip Google/mail gate (e.g. Telegram path already validated). */
  skipRequirementCheck?: boolean
  modelSlug?: string
}

async function googleConnected(requesterId: string): Promise<boolean> {
  try {
    const accounts = await listGoogleAccounts(requesterId)
    return accounts.length > 0
  } catch {
    return false
  }
}

async function mailConnected(requesterId: string): Promise<boolean> {
  if (await isImapConfigured()) return true
  return googleConnected(requesterId)
}

function emptyResult(
  partial: Pick<AssistantRunResult, 'assistantId' | 'nameAr' | 'toolNames'> & {
    blocked: NonNullable<AssistantRunResult['blocked']>
  }
): AssistantRunResult {
  return {
    assistantId: partial.assistantId,
    nameAr: partial.nameAr,
    text: '',
    modelSlug: '',
    toolNames: partial.toolNames,
    usedTools: [],
    steps: 0,
    citations: [],
    pendingApprovalIds: [],
    blocked: partial.blocked,
  }
}

/**
 * Run a catalog assistant one-shot via the existing engine (tool-scoped).
 * Mail assistants accept IMAP/SMTP OR Google Gmail.
 */
export async function runAssistant(
  input: RunAssistantInput
): Promise<AssistantRunResult> {
  const assistant = getAssistant(input.assistantId)
  if (!assistant) {
    return emptyResult({
      assistantId: input.assistantId as AssistantId,
      nameAr: 'غير معروف',
      toolNames: [],
      blocked: {
        reason: 'auth',
        messageAr: 'المساعد غير موجود في النواة العامة.',
      },
    })
  }

  const prompt = input.message.trim()
  if (!prompt) {
    return emptyResult({
      assistantId: assistant.id,
      nameAr: assistant.nameAr,
      toolNames: [...assistant.allowedTools],
      blocked: {
        reason: 'auth',
        messageAr: 'اكتب النتيجة المطلوبة بالعربية قبل التشغيل.',
      },
    })
  }

  if (!input.skipRequirementCheck) {
    if (assistant.requires === 'mail' && !(await mailConnected(input.requesterId))) {
      return emptyResult({
        assistantId: assistant.id,
        nameAr: assistant.nameAr,
        toolNames: [...assistant.allowedTools],
        blocked: {
          reason: 'mail',
          messageAr:
            assistant.emptyStateAr ||
            'يلزم ربط بريد الجمعية عبر IMAP/SMTP من الإعدادات → «بريد الجمعية»، أو ربط Google.',
        },
      })
    }
    if (
      assistant.requires === 'google' &&
      !(await googleConnected(input.requesterId))
    ) {
      return emptyResult({
        assistantId: assistant.id,
        nameAr: assistant.nameAr,
        toolNames: [...assistant.allowedTools],
        blocked: {
          reason: 'google',
          messageAr:
            assistant.emptyStateAr ||
            'يلزم ربط Google أولاً (Gmail / تقويم) — أو اضبط IMAP من «بريد الجمعية».',
        },
      })
    }
  }

  // Assistants need room to call tools — never inherit Telegram fast-path (2–3).
  const maxSteps = Math.max(10, Math.min(16, assistant.maxSteps ?? 12))

  const system = await buildScopedSystemPrompt(
    assistant.systemPromptAr,
    scopeCtxForAssistant(input.scopeId, input.requesterId)
  )

  const result = await runAgentEngine({
    prompt,
    system,
    modelSlug: input.modelSlug || assistant.modelSlug,
    scopeId: input.scopeId,
    requesterId: input.requesterId,
    mode: input.mode,
    includeMcpTools: false,
    maxSteps,
    allowedTools: [...assistant.allowedTools],
  })

  return {
    assistantId: assistant.id,
    nameAr: assistant.nameAr,
    text: result.text,
    modelSlug: result.modelSlug,
    toolNames: result.toolNames,
    usedTools: result.usedTools || [],
    steps: result.steps,
    citations: result.citations,
    pendingApprovalIds: result.pendingApprovalIds,
  }
}
