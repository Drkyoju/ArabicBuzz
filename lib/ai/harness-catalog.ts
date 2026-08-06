export type HarnessModelSlug =
  | 'claude-opus-4-8'
  | 'claude-opus-5'
  | 'gpt-5.6-sol'
  | 'gemini-3.1-pro'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'moonshotai/kimi-k3-free'
  | 'glm-4.5'
  | 'glm-5'
  | 'ollama-local'
  | 'perplexity-sonar'
  | 'deepseek-r1'

/** Three user-facing tiers — engineer model names stay in labelEn. */
export type HarnessTier = 'fast' | 'balanced' | 'max'

export const HARNESS_TIER_LABELS_AR: Record<HarnessTier, string> = {
  fast: 'سريع',
  balanced: 'متوازن',
  max: 'أعلى دقة',
}

export const HARNESS_TIER_HINTS_AR: Record<HarnessTier, string> = {
  fast: 'ردود فورية للأسئلة القصيرة والتفريغ الصوتي.',
  balanced: 'الخيار اليومي — جودة جيدة بتكلفة معقولة.',
  max: 'للتحليل الطويل والقرارات والمستندات الحساسة.',
}

export const HARNESS_TIER_ORDER: HarnessTier[] = ['fast', 'balanced', 'max']

export type HarnessModelMeta = {
  slug: HarnessModelSlug
  labelAr: string
  labelEn: string
  tier: HarnessTier
  provider:
    | 'google'
    | 'agentrouter'
    | 'ollama'
    | 'perplexity'
    | 'glm'
    | 'tokenrouter'
  requiresKey: string
  airGapSafe: boolean
  /** Catalog entry kept for history/UI honesty — never selected or routed. */
  unavailable?: boolean
}

export const HARNESS_MODEL_CATALOG: HarnessModelMeta[] = [
  {
    slug: 'gemini-3.1-pro',
    tier: 'max',
    labelAr: 'أعلى دقة',
    labelEn: 'Gemini 3.1 Pro',
    provider: 'google',
    requiresKey: 'GEMINI_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'gemini-2.5-flash',
    tier: 'fast',
    labelAr: 'استجابة سريعة',
    labelEn: 'Gemini 2.5 Flash',
    provider: 'google',
    requiresKey: 'GEMINI_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'glm-5',
    tier: 'max',
    labelAr: 'أعلى دقة · بديل',
    labelEn: 'Zhipu GLM-5',
    provider: 'glm',
    requiresKey: 'GLM_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'glm-4.5',
    tier: 'balanced',
    labelAr: 'متوازن · تكلفة',
    labelEn: 'Zhipu GLM-4.5',
    provider: 'glm',
    requiresKey: 'GLM_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'claude-opus-5',
    tier: 'max',
    labelAr: 'أعلى دقة · Opus 5',
    labelEn: 'Claude Opus 5',
    provider: 'agentrouter',
    requiresKey: 'AGENTROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'claude-opus-4-8',
    tier: 'max',
    labelAr: 'أعلى دقة · تحليل',
    labelEn: 'Claude Opus 4.8',
    provider: 'agentrouter',
    requiresKey: 'AGENTROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'gpt-5.6-sol',
    tier: 'balanced',
    labelAr: 'متوازن · عام',
    labelEn: 'GPT-5.6 Sol',
    provider: 'agentrouter',
    requiresKey: 'AGENTROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'moonshotai/kimi-k3-free',
    tier: 'fast',
    labelAr: 'Kimi K3 Free · سريع',
    labelEn: 'Kimi K3 Free',
    provider: 'tokenrouter',
    requiresKey: 'TOKENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'perplexity-sonar',
    tier: 'fast',
    labelAr: 'بحث حي · Perplexity',
    labelEn: 'Perplexity Sonar',
    provider: 'perplexity',
    requiresKey: 'PERPLEXITY_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'ollama-local',
    tier: 'fast',
    labelAr: 'خصوصية عالية — محلي',
    labelEn: 'Ollama Local',
    provider: 'ollama',
    requiresKey: 'OLLAMA_BASE_URL',
    airGapSafe: true,
  },
  {
    slug: 'deepseek-r1',
    tier: 'max',
    labelAr: 'تفكير عميق · محلي',
    labelEn: 'DeepSeek R1 (Ollama)',
    provider: 'ollama',
    requiresKey: 'OLLAMA_BASE_URL',
    airGapSafe: true,
  },
]

export const HARNESS_MODEL_SLUGS: HarnessModelSlug[] =
  HARNESS_MODEL_CATALOG.map((m) => m.slug)

export function listAvailableHarnessModels(
  airGapped: boolean
): HarnessModelMeta[] {
  const base = airGapped
    ? HARNESS_MODEL_CATALOG.filter((m) => m.airGapSafe)
    : HARNESS_MODEL_CATALOG
  return base.filter((m) => !m.unavailable)
}

/** Filter catalog by which provider keys are configured (QM-style). */
export function listServiceableHarnessModels(
  airGapped: boolean,
  configuredKeys: Set<string> | string[]
): HarnessModelMeta[] {
  const keys = configuredKeys instanceof Set ? configuredKeys : new Set(configuredKeys)
  return listAvailableHarnessModels(airGapped).filter((m) => {
    if (m.provider === 'ollama') return true
    return keys.has(m.requiresKey)
  })
}

/** Best available model per tier — catalog order is the preference order. */
export function tiersForModels(
  models: HarnessModelMeta[]
): Array<{ tier: HarnessTier; labelAr: string; hintAr: string; model: HarnessModelMeta }> {
  const out: Array<{
    tier: HarnessTier
    labelAr: string
    hintAr: string
    model: HarnessModelMeta
  }> = []
  for (const tier of HARNESS_TIER_ORDER) {
    const model = models.find((m) => m.tier === tier)
    if (!model) continue
    out.push({
      tier,
      labelAr: HARNESS_TIER_LABELS_AR[tier],
      hintAr: HARNESS_TIER_HINTS_AR[tier],
      model,
    })
  }
  return out
}
