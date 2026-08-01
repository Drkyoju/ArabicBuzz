export type HarnessModelSlug =
  | 'openai-gpt-4o'
  | 'openai-gpt-4o-mini'
  | 'claude-3.5-sonnet'
  | 'claude-sonnet-4'
  | 'deepseek-v3'
  | 'deepseek-r1'
  | 'qwen-2.5-72b'
  | 'gemini-2.0-flash'
  | 'gemini-2.5-pro'
  | 'kimi-k2'
  | 'glm-4.5'
  | 'ollama-local'
  | 'perplexity-sonar'
  | 'hermes-3-405b'
  | 'hermes-2-pro-8b'

export type HarnessModelMeta = {
  slug: HarnessModelSlug
  labelAr: string
  labelEn: string
  provider: 'openai' | 'google' | 'openrouter' | 'ollama' | 'perplexity' | 'glm'
  requiresKey: string
  airGapSafe: boolean
}

export const HARNESS_MODEL_CATALOG: HarnessModelMeta[] = [
  {
    slug: 'openai-gpt-4o',
    labelAr: 'OpenAI GPT-4o',
    labelEn: 'GPT-4o',
    provider: 'openai',
    requiresKey: 'OPENAI_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'openai-gpt-4o-mini',
    labelAr: 'OpenAI GPT-4o Mini',
    labelEn: 'GPT-4o Mini',
    provider: 'openai',
    requiresKey: 'OPENAI_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'claude-3.5-sonnet',
    labelAr: 'Claude 3.5 Sonnet',
    labelEn: 'Claude 3.5 Sonnet',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'claude-sonnet-4',
    labelAr: 'Claude Sonnet 4',
    labelEn: 'Claude Sonnet 4',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'deepseek-v3',
    labelAr: 'DeepSeek V3',
    labelEn: 'DeepSeek V3',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'deepseek-r1',
    labelAr: 'DeepSeek R1',
    labelEn: 'DeepSeek R1',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: true,
  },
  {
    slug: 'gemini-2.0-flash',
    labelAr: 'Gemini 2.0 Flash',
    labelEn: 'Gemini 2.0 Flash',
    provider: 'google',
    requiresKey: 'GEMINI_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'gemini-2.5-pro',
    labelAr: 'Gemini 2.5 Pro',
    labelEn: 'Gemini 2.5 Pro',
    provider: 'google',
    requiresKey: 'GEMINI_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'kimi-k2',
    labelAr: 'Kimi K2',
    labelEn: 'Moonshot Kimi K2',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'glm-4.5',
    labelAr: 'GLM-4.5',
    labelEn: 'Zhipu GLM-4.5',
    provider: 'glm',
    requiresKey: 'GLM_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'qwen-2.5-72b',
    labelAr: 'Qwen 2.5 72B',
    labelEn: 'Qwen 2.5 72B',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'hermes-3-405b',
    labelAr: 'Hermes 3 405B',
    labelEn: 'Nous Hermes 3',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'hermes-2-pro-8b',
    labelAr: 'Hermes 2 Pro 8B',
    labelEn: 'Nous Hermes 2 Pro',
    provider: 'openrouter',
    requiresKey: 'OPENROUTER_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'perplexity-sonar',
    labelAr: 'Perplexity Sonar',
    labelEn: 'Perplexity Sonar',
    provider: 'perplexity',
    requiresKey: 'PERPLEXITY_API_KEY',
    airGapSafe: false,
  },
  {
    slug: 'ollama-local',
    labelAr: 'Ollama (محلي)',
    labelEn: 'Ollama Local',
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
  if (!airGapped) return HARNESS_MODEL_CATALOG
  return HARNESS_MODEL_CATALOG.filter((m) => m.airGapSafe)
}
