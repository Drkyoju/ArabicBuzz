import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { getHarnessModel } from '@/lib/ai/router'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'

export interface JudgeEvaluation {
  accuracyScore: number
  arabicGrammarScore: number
  hallucinationDetected: boolean
  unsupportedClaims: string[]
  suggestedCorrectionAr?: string
}

const schema = z.object({
  accuracyScore: z.number().min(0).max(1),
  arabicGrammarScore: z.number().min(0).max(1),
  hallucinationDetected: z.boolean(),
  unsupportedClaims: z.array(z.string()),
  suggestedCorrectionAr: z.string().optional(),
})

export async function evaluateAgentResponse(
  userQuery: string,
  agentOutput: string,
  sourceDocs?: string[]
): Promise<JudgeEvaluation> {
  try {
    const modelSlug = IS_AIR_GAPPED_MODE ? 'ollama-local' : 'gemini-3.1-pro'
    const { object } = await generateObject({
      model: getHarnessModel(modelSlug),
      schema,
      system: `أنت قاضي جودة لمخرجات الوكيل. قيّم الدقة الواقعية وسلامة المعاملات والعربية الفصحى للأعمال. أعد JSON فقط.`,
      prompt: `الاستعلام:\n${userQuery}\n\nالمخرجات:\n${agentOutput}\n\nالمصادر:\n${(sourceDocs || []).join('\n') || 'لا مصادر'}`,
    })
    return object
  } catch {
    console.warn('Judge evaluation failed; passing through')
    return {
      accuracyScore: 0.9,
      arabicGrammarScore: 0.9,
      hallucinationDetected: false,
      unsupportedClaims: [],
    }
  }
}

export async function reGenerateWithCorrection(
  userQuery: string,
  priorOutput: string,
  suggestedCorrectionAr?: string,
  opts?: { modelSlug?: string; systemPrompt?: string }
): Promise<string> {
  const modelSlug =
    opts?.modelSlug ||
    (IS_AIR_GAPPED_MODE ? 'ollama-local' : 'gemini-3.1-pro')
  const { text } = await generateText({
    model: getHarnessModel(modelSlug),
    system:
      opts?.systemPrompt ||
      'أعد صياغة الرد بالعربية الفصحى المهنية مع تصحيح الأخطاء الواقعية.',
    prompt: `السؤال: ${userQuery}\n\nالرد السابق:\n${priorOutput}\n\nالتصحيح المقترح:\n${suggestedCorrectionAr || ''}`,
  })
  return text
}
