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

/**
 * Run a catalog assistant one-shot via the existing engine (tool-scoped).
 * Telegram captain is soft-gated in the UI (summarize works; send needs bind).
 */
export async function runAssistant(
  input: RunAssistantInput
): Promise<AssistantRunResult> {
  const assistant = getAssistant(input.assistantId)
  if (!assistant) {
    return {
      assistantId: input.assistantId as AssistantId,
      nameAr: 'غير معروف',
      text: '',
      modelSlug: '',
      toolNames: [],
      steps: 0,
      citations: [],
      pendingApprovalIds: [],
      blocked: {
        reason: 'auth',
        messageAr: 'المساعد غير موجود في النواة العامة.',
      },
    }
  }

  const prompt = input.message.trim()
  if (!prompt) {
    return {
      assistantId: assistant.id,
      nameAr: assistant.nameAr,
      text: '',
      modelSlug: '',
      toolNames: [...assistant.allowedTools],
      steps: 0,
      citations: [],
      pendingApprovalIds: [],
      blocked: {
        reason: 'auth',
        messageAr: 'اكتب النتيجة المطلوبة بالعربية قبل التشغيل.',
      },
    }
  }

  if (
    !input.skipRequirementCheck &&
    assistant.requires === 'google' &&
    !(await googleConnected(input.requesterId))
  ) {
    return {
      assistantId: assistant.id,
      nameAr: assistant.nameAr,
      text: '',
      modelSlug: '',
      toolNames: [...assistant.allowedTools],
      steps: 0,
      citations: [],
      pendingApprovalIds: [],
      blocked: {
        reason: 'google',
        messageAr:
          assistant.emptyStateAr ||
          'يلزم ربط Google من الإعدادات أولاً (تقويم / Gmail / Drive).',
      },
    }
  }

  const result = await runAgentEngine({
    prompt,
    system: assistant.systemPromptAr,
    modelSlug: input.modelSlug || assistant.modelSlug,
    scopeId: input.scopeId,
    requesterId: input.requesterId,
    mode: input.mode,
    includeMcpTools: false,
    maxSteps: assistant.maxSteps ?? 5,
    allowedTools: [...assistant.allowedTools],
  })

  return {
    assistantId: assistant.id,
    nameAr: assistant.nameAr,
    text: result.text,
    modelSlug: result.modelSlug,
    toolNames: result.toolNames,
    steps: result.steps,
    citations: result.citations,
    pendingApprovalIds: result.pendingApprovalIds,
  }
}
