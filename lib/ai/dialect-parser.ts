import { generateObject } from 'ai'
import { z } from 'zod'
import { getHarnessModel } from '@/lib/ai/router'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'

export type DetectedLanguageTag =
  | 'عامية_سعودية'
  | 'فصحى'
  | 'إنجليزي'
  | string

export type NormalizedArabicPrompt = {
  normalizedPromptAr: string
  detectedLanguage: DetectedLanguageTag[]
  extractedParameters: Record<string, unknown>
  rawUserPrompt: string
}

const schema = z.object({
  normalizedPromptAr: z.string(),
  detectedLanguage: z.array(z.string()),
  extractedParameters: z.record(z.string(), z.unknown()),
})

const SYSTEM = `أنت محرك تحليل النصوص والمصطلحات الدارجة في السعودية والخليج. افهم العامية السعودية (نجد/حجاز/جنوبية) والخليجية والفصحى والخلط مع الإنجليزي.
أعد JSON يتضمن:
1. normalizedPromptAr: إعادة صياغة الطلب بلغة عربية فصحى واضحة تحافظ على القصد التشغيلي (ملفات، تقويم، قرارات…).
2. detectedLanguage: اللغات أو اللهجات المستخدمة (عامية_سعودية / خليجية / فصحى / إنجليزي).
3. extractedParameters: المخرجات والمصطلحات التقنية المستخرجة.`

export type NormalizeArabicPromptOpts = {
  /** Override model (Telegram prefers flash). Default: gemini-3.1-pro / ollama. */
  modelSlug?: string
  /** When true, skip the LLM rewrite and return the raw prompt. */
  skip?: boolean
}

export async function normalizeArabicPrompt(
  rawUserPrompt: string,
  opts?: NormalizeArabicPromptOpts
): Promise<NormalizedArabicPrompt> {
  if (opts?.skip) {
    return {
      normalizedPromptAr: rawUserPrompt,
      detectedLanguage: ['تخطي'],
      extractedParameters: {},
      rawUserPrompt,
    }
  }
  try {
    const modelSlug =
      opts?.modelSlug ||
      (IS_AIR_GAPPED_MODE ? 'ollama-local' : 'gemini-3.1-pro')
    const { object } = await generateObject({
      model: getHarnessModel(modelSlug),
      schema,
      system: SYSTEM,
      prompt: rawUserPrompt,
    })
    return { ...object, rawUserPrompt }
  } catch {
    return {
      normalizedPromptAr: rawUserPrompt,
      detectedLanguage: ['غير_معروف'],
      extractedParameters: {},
      rawUserPrompt,
    }
  }
}
