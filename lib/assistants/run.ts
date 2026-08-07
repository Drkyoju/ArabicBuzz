import { listGoogleAccounts } from '@/lib/google/tokens'
import { runAgentEngine } from '@/lib/agents/engine'
import { getAssistant } from '@/lib/assistants/catalog'
import type {
  AssistantId,
  AssistantRunResult,
} from '@/lib/assistants/types'
import type { SecurityPostureMode } from '@/lib/security/posture'

export type RunAssistantInput = {
  assistantId: string
  /** User outcome in Arabic (or edited starter). */
  message: string
  scopeId: string
  requesterId: string
  mode?: SecurityPostureMode
  /** Skip Google gate (e.g. Telegram path already validated). */
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
 * Telegram captain is soft-gated in the UI (summarize works; send needs bind).
 * Assistants use their own maxSteps (8–12) — not Telegram fast-path limits.
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

  if (
    !input.skipRequirementCheck &&
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
          'يلزم ربط Google أولاً (Gmail / تقويم) — اضغط «اربط Google الآن».',
      },
    })
  }

  // Assistants need room to call tools — never inherit Telegram fast-path (2–3).
  const maxSteps = Math.max(8, Math.min(16, assistant.maxSteps ?? 10))

  const result = await runAgentEngine({
    prompt,
    system: assistant.systemPromptAr,
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
