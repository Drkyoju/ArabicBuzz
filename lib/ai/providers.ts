import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createPerplexity } from '@ai-sdk/perplexity'
import { IS_AIR_GAPPED_MODE, validateNetworkAccess } from '@/lib/security/airgap'
import type { HarnessModelSlug } from '@/lib/ai/harness-catalog'

export const AIRGAP_ALLOWED_MODELS = (
  process.env.AIRGAP_ALLOWED_MODELS || 'qwen2.5:32b,ALLaM,deepseek-r1'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export function getOllamaBaseUrl() {
  return process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1'
}

export function createOllamaProvider() {
  const baseURL = getOllamaBaseUrl()
  validateNetworkAccess(baseURL)
  return createOpenAI({
    baseURL,
    apiKey: 'ollama',
  })
}

/**
 * Cloud providers for the multi-model gateway.
 * Keys come from Netlify Environment Variables / `.env.local`.
 */
export function getCloudProviders() {
  if (IS_AIR_GAPPED_MODE) {
    throw new Error(
      'عفواً، النظام يعمل حالياً في الوضع المحلي المغلق (Air-Gapped Mode) ولا يسمح بالاتصال بالخدمات الخارجية.'
    )
  }
  return {
    openrouter: createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY || '',
    }),
    google: createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY || '',
    }),
    perplexity: createPerplexity({
      apiKey: process.env.PERPLEXITY_API_KEY || '',
    }),
    openaiCloud: createOpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    }),
  }
}

export function resolveAirGapModelId(preferred?: string): string {
  const fallback =
    process.env.OLLAMA_MODEL || AIRGAP_ALLOWED_MODELS[0] || 'qwen2.5:32b'
  if (preferred && AIRGAP_ALLOWED_MODELS.includes(preferred)) return preferred
  return fallback
}

const OPENROUTER_IDS: Record<string, string> = {
  'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',
  'claude-sonnet-4': 'anthropic/claude-sonnet-4',
  'deepseek-v3': 'deepseek/deepseek-chat',
  'deepseek-r1': 'deepseek/deepseek-r1',
  'qwen-2.5-72b': 'qwen/qwen-2.5-72b-instruct',
  'qwen-2.5': 'qwen/qwen-2.5-72b-instruct',
  'kimi-k2': 'moonshotai/kimi-k2',
  'glm-4.5': 'z-ai/glm-4.5',
  'hermes-3-405b': 'nousresearch/hermes-3-llama-3.1-405b',
  'hermes-2-pro-8b': 'nousresearch/hermes-2-pro-llama-3-8b',
  // Allow raw OpenRouter ids: "anthropic/claude-3.5-sonnet"
}

const GOOGLE_IDS: Record<string, string> = {
  'gemini-2.0-flash': 'gemini-2.0-flash',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-flash': 'gemini-2.0-flash',
}

const OPENAI_IDS: Record<string, string> = {
  'openai-gpt-4o': 'gpt-4o',
  'openai-gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
}

const PERPLEXITY_IDS: Record<string, string> = {
  'perplexity-sonar': 'sonar',
  sonar: 'sonar',
  'sonar-pro': 'sonar-pro',
}

export class UnknownModelError extends Error {
  constructor(modelId: string) {
    super(`Unknown model id: ${modelId}`)
    this.name = 'UnknownModelError'
  }
}

/**
 * Unified multi-model gateway.
 * Returns a Vercel AI SDK model instance for OpenRouter / Gemini / Perplexity / OpenAI / Ollama.
 */
export function getModel(modelId: string) {
  const id = (modelId || process.env.DEFAULT_HARNESS_MODEL || 'gemini-2.0-flash').trim()

  if (IS_AIR_GAPPED_MODE || id === 'ollama-local') {
    const ollama = createOllamaProvider()
    const localId =
      id === 'deepseek-r1'
        ? resolveAirGapModelId('deepseek-r1')
        : resolveAirGapModelId(id === 'ollama-local' ? undefined : id)
    return ollama(localId)
  }

  // Raw OpenRouter path: provider/model
  if (id.includes('/') && !GOOGLE_IDS[id] && !OPENAI_IDS[id]) {
    const { openrouter } = getCloudProviders()
    return openrouter.chat(id)
  }

  const googleId = GOOGLE_IDS[id]
  if (googleId) {
    return getCloudProviders().google(googleId)
  }

  const pplxId = PERPLEXITY_IDS[id]
  if (pplxId) {
    return getCloudProviders().perplexity(pplxId)
  }

  const openaiId = OPENAI_IDS[id]
  if (openaiId) {
    return getCloudProviders().openaiCloud(openaiId)
  }

  const orId = OPENROUTER_IDS[id]
  if (orId) {
    return getCloudProviders().openrouter.chat(orId)
  }

  throw new UnknownModelError(id)
}

/** Type-friendly alias for harness catalog slugs. */
export function getModelBySlug(slug: HarnessModelSlug) {
  return getModel(slug)
}
