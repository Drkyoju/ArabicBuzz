import { normalizeArabicPrompt } from '@/lib/ai/dialect-parser'
import { buildScopedSystemPrompt } from '@/lib/skills/registry'
import type { ActiveScopeContext } from '@/lib/scopes/types'
import {
  evaluateAgentResponse,
  reGenerateWithCorrection,
  JudgeEvaluation,
} from '@/lib/evals/judge'
import { orchestrateParallelWorkflow } from '@/lib/agents/orchestrator'
import { runAgentEngine } from '@/lib/agents/engine'
import {
  calculatePromptHash,
  classifySDAIARisk,
  resolveDataLocality,
} from '@/lib/audit/provenance'
import { logSDAIAEvent } from '@/lib/audit/logger'

export type PipelineResult = {
  output: string
  evaluation: JudgeEvaluation
  retried: boolean
  qualityWarning: boolean
  normalizedPromptAr: string
}

function wantsParallel(prompt: string, mode?: string) {
  if (mode === 'parallel') return true
  return prompt.length > 280 || /و|ثم|أيضا|وكلاء|بالتوازي/.test(prompt)
}

export async function runAgentPipeline(input: {
  rawUserPrompt: string
  scopeCtx: ActiveScopeContext
  modelSlug?: string
  mode?: 'single' | 'parallel'
  contextDocs?: string[]
}): Promise<PipelineResult> {
  const normalized = await normalizeArabicPrompt(input.rawUserPrompt)
  const modelSlug =
    input.modelSlug || process.env.DEFAULT_HARNESS_MODEL || 'gemini-2.0-flash'
  const baseSystem =
    'أنت وكيل Arabic Buzz. أجب دائماً بالعربية الفصحى المهنية مع الحفاظ على المصطلحات التقنية المحلية عند الحاجة.'

  const system = buildScopedSystemPrompt(baseSystem, input.scopeCtx)

  let output: string
  if (wantsParallel(normalized.normalizedPromptAr, input.mode)) {
    const orch = await orchestrateParallelWorkflow(
      normalized.normalizedPromptAr,
      isSharedId(input.scopeCtx),
      { modelSlug }
    )
    output = orch.finalReplyAr
  } else {
    const result = await runAgentEngine({
      prompt: normalized.normalizedPromptAr,
      system: `${system}\n\nمعاملات مستخرجة: ${JSON.stringify(normalized.extractedParameters)}`,
      modelSlug,
      scopeId: isSharedId(input.scopeCtx),
      requesterId: input.scopeCtx.userId,
      includeMcpTools: true,
    })
    output = result.text
  }

  const evaluation = await evaluateAgentResponse(
    normalized.normalizedPromptAr,
    output,
    input.contextDocs
  )

  let retried = false
  if (evaluation.hallucinationDetected || evaluation.accuracyScore < 0.75) {
    output = await reGenerateWithCorrection(
      normalized.normalizedPromptAr,
      output,
      evaluation.suggestedCorrectionAr,
      { modelSlug, systemPrompt: system }
    )
    retried = true
  }

  const qualityWarning =
    !evaluation.hallucinationDetected &&
    evaluation.accuracyScore >= 0.75 &&
    evaluation.accuracyScore < 0.85

  await logSDAIAEvent({
    scopeId: isSharedId(input.scopeCtx),
    userId: input.scopeCtx.userId,
    modelUsed: modelSlug,
    promptHash: calculatePromptHash(normalized.normalizedPromptAr),
    responseHash: calculatePromptHash(output),
    riskTier: classifySDAIARisk('text_generate', []),
    dataLocality: resolveDataLocality(modelSlug),
  })

  return {
    output,
    evaluation,
    retried,
    qualityWarning,
    normalizedPromptAr: normalized.normalizedPromptAr,
  }
}

function isSharedId(ctx: ActiveScopeContext) {
  return ctx.scope.id
}
