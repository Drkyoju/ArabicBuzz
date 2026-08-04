import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createPerplexity } from '@ai-sdk/perplexity'
import { IS_AIR_GAPPED_MODE, validateNetworkAccess } from '@/lib/security/airgap'
import type { HarnessModelSlug } from '@/lib/ai/harness-catalog'
import { resolveProviderKeySync } from '@/lib/ai/provider-key-store'

export const AIRGAP_ALLOWED_MODELS = (
  process.env.AIRGAP_ALLOWED_MODELS || 'qwen2.5:32b,ALLaM,deepseek-r1'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export function getOllamaBaseUrl() {
  const raw =
    resolveProviderKeySync('OLLAMA_BASE_URL') ||
    process.env.OLLAMA_BASE_URL ||
    ''
  if (!raw.trim()) return ''
  try {
    const host = new URL(raw).hostname
    // Public site never falls back to a machine-local Ollama
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0'
    ) {
      return ''
    }
  } catch {
    return ''
  }
  return raw
}

export function createOllamaProvider() {
  const baseURL = getOllamaBaseUrl()
  if (!baseURL) {
    throw new Error(
      'Ollama غير مُعدّ. اضبط OLLAMA_BASE_URL صراحةً (الموقع العام يستخدم نماذج السحابة فقط).'
    )
  }
  validateNetworkAccess(baseURL)
  return createOpenAI({
    baseURL,
    apiKey: 'ollama',
  })
}

/**
 * Cloud providers for the multi-model gateway.
 * Keys: UI override (encrypted DB) → Netlify / `.env.local`.
 * Call `warmProviderKeyCache()` on the request path first.
 */
export function getCloudProviders() {
  if (IS_AIR_GAPPED_MODE) {
    throw new Error(
      'عفواً، النظام يعمل حالياً في الوضع المحلي المغلق (Air-Gapped Mode) ولا يسمح بالاتصال بالخدمات الخارجية.'
    )
  }
  return {
    openrouter: createOpenRouter({
      apiKey: resolveProviderKeySync('OPENROUTER_API_KEY'),
    }),
    google: createGoogleGenerativeAI({
      apiKey: resolveProviderKeySync('GEMINI_API_KEY'),
    }),
    perplexity: createPerplexity({
      apiKey: resolveProviderKeySync('PERPLEXITY_API_KEY'),
    }),
    openaiCloud: createOpenAI({
      apiKey: resolveProviderKeySync('OPENAI_API_KEY'),
    }),
    /** Z.AI / Zhipu GLM — OpenAI-compatible (https://api.z.ai/api/paas/v4) */
    glm: createOpenAI({
      apiKey: resolveProviderKeySync('GLM_API_KEY'),
      baseURL:
        process.env.GLM_BASE_URL || 'https://api.z.ai/api/paas/v4',
    }),
  }
}

/** Throw a clear Arabic error if the selected model's key is missing. */
export function assertModelKeyConfigured(modelId: string) {
  const id = (modelId || '').trim()
  const checks: Array<{ match: (s: string) => boolean; env: string; label: string }> = [
    {
      match: (s) => s.startsWith('gemini') || s.includes('gemini'),
      env: 'GEMINI_API_KEY',
      label: 'Gemini',
    },
    {
      match: (s) =>
        s.startsWith('openai') || s === 'gpt-4o' || s === 'gpt-4o-mini',
      env: 'OPENAI_API_KEY',
      label: 'OpenAI',
    },
    {
      match: (s) => s.startsWith('glm') || s === 'glm',
      env: 'GLM_API_KEY',
      label: 'GLM',
    },
    {
      match: (s) => s.startsWith('perplexity') || s.startsWith('sonar'),
      env: 'PERPLEXITY_API_KEY',
      label: 'Perplexity',
    },
    {
      match: (s) =>
        s.includes('/') ||
        s.startsWith('claude') ||
        s.startsWith('deepseek') ||
        s.startsWith('qwen') ||
        s.startsWith('kimi') ||
        s.startsWith('hermes'),
      env: 'OPENROUTER_API_KEY',
      label: 'OpenRouter',
    },
  ]
  if (IS_AIR_GAPPED_MODE || id === 'ollama-local') return
  for (const c of checks) {
    if (!c.match(id)) continue
    if (!resolveProviderKeySync(c.env)) {
      throw new Error(
        `مفتاح ${c.label} غير مضبوط. افتح «مفاتيح API» من الشريط وأضف ${c.env}.`
      )
    }
    return
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
  'hermes-3-405b': 'nousresearch/hermes-3-llama-3.1-405b',
  'hermes-2-pro-8b': 'nousresearch/hermes-2-pro-llama-3-8b',
  // Allow raw OpenRouter ids: "anthropic/claude-3.5-sonnet"
}

const GLM_IDS: Record<string, string> = {
  'glm-4.5': 'glm-4.5',
  'glm-4.5-air': 'glm-4.5-air',
  'glm-4-flash': 'glm-4-flash',
  glm: 'glm-4.5',
}

const GOOGLE_IDS: Record<string, string> = {
  'gemini-2.0-flash': 'gemini-2.5-flash',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-flash': 'gemini-2.5-flash',
  // 2.5 Pro is closed to many new keys — route to the current Pro tier
  'gemini-2.5-pro': 'gemini-3.1-pro-preview',
  'gemini-3.1-pro': 'gemini-3.1-pro-preview',
  'gemini-pro-latest': 'gemini-pro-latest',
  'gemini-pro': 'gemini-3.1-pro-preview',
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
  const id = (modelId || process.env.DEFAULT_HARNESS_MODEL || 'gemini-3.1-pro').trim()
  assertModelKeyConfigured(id)

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

  const glmId = GLM_IDS[id]
  if (glmId) {
    return getCloudProviders().glm(glmId)
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
