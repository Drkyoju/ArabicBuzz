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

const SYSTEM = `أنت محرك تحليل النصوص والمصطلحات الدارجة. قم بتحليل النص التالي واستخراج القصد الرئيسي وإرجاع JSON يتضمن:
1. normalizedPromptAr: إعادة صياغة الطلب بلغة عربية فصحى واضحة.
2. detectedLanguage: اللغات أو اللهجات المستخدمة (عامية سعودية / فصحى / إنجليزي).
3. extractedParameters: المخرجات والمصطلحات التقنية المستخرجة.`

export async function normalizeArabicPrompt(
  rawUserPrompt: string
): Promise<NormalizedArabicPrompt> {
  try {
    const modelSlug = IS_AIR_GAPPED_MODE ? 'ollama-local' : 'gemini-2.0-flash'
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
