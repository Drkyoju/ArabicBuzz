export type HarnessModelSlug =
  | 'openai-gpt-4o'
  | 'openai-gpt-4o-mini'
  | 'claude-3.5-sonnet'
  | 'claude-sonnet-4'
  | 'claude-opus-4-8'
  | 'claude-opus-5'
  | 'gpt-5.6-sol'
  | 'deepseek-v3'
  | 'deepseek-r1'
  | 'qwen-2.5-72b'
  | 'gemini-3.1-pro'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'kimi-k2'
  | 'moonshotai/kimi-k3-free'
  | 'glm-4.5'
  | 'glm-5'
  | 'ollama-local'
  | 'perplexity-sonar'
  | 'hermes-3-405b'
  | 'hermes-2-pro-8b'

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
    | 'openai'
    | 'google'
    | 'openrouter'
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
    slug: 'openai-gpt-4o',
    tier: 'balanced',
    labelAr: 'أعلى دقة · OpenAI',
    labelEn: 'GPT-4o',
    provider: 'openai',
    requiresKey: 'OPENAI_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'openai-gpt-4o-mini',
    tier: 'fast',
    labelAr: 'استجابة سريعة · OpenAI',
    labelEn: 'GPT-4o Mini',
    provider: 'openai',
    requiresKey: 'OPENAI_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'claude-3.5-sonnet',
    tier: 'balanced',
    labelAr: 'أعلى دقة · Claude',
    labelEn: 'Claude 3.5 Sonnet',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'claude-sonnet-4',
    tier: 'max',
    labelAr: 'أعلى دقة · Claude 4',
    labelEn: 'Claude Sonnet 4',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'deepseek-v3',
    tier: 'balanced',
    labelAr: 'متوازن · DeepSeek',
    labelEn: 'DeepSeek V3',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'deepseek-r1',
    tier: 'max',
    labelAr: 'تفكير عميق · DeepSeek',
    labelEn: 'DeepSeek R1',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: true,
  },
  {
    slug: 'kimi-k2',
    tier: 'balanced',
    labelAr: 'طويل السياق · Kimi',
    labelEn: 'Moonshot Kimi K2',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'qwen-2.5-72b',
    tier: 'balanced',
    labelAr: 'عربي قوي · Qwen',
    labelEn: 'Qwen 2.5 72B',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'hermes-3-405b',
    tier: 'max',
    labelAr: 'تحليل معمق · Hermes',
    labelEn: 'Nous Hermes 3',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'hermes-2-pro-8b',
    tier: 'fast',
    labelAr: 'سريع · Hermes',
    labelEn: 'Nous Hermes 2 Pro',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
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
    slug: 'moonshotai/kimi-k3-free',
    tier: 'fast',
    labelAr: 'Kimi K3 Free · سريع',
    labelEn: 'Kimi K3 Free',
    provider: 'tokenrouter',
    requiresKey: 'TOKENROUTER_API_KEY',
    airGapSafe: false,
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
