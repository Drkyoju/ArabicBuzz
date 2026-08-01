import { PROVIDER_DEFS } from '@/lib/ai/provider-defs'
import {
  HARNESS_MODEL_CATALOG,
  type HarnessModelMeta,
} from '@/lib/ai/harness-catalog'
import {
  listProviderKeyStatuses,
  resolveProviderKey,
  type ProviderKeyStatus,
} from '@/lib/ai/provider-key-store'

export type ModelAvailability = HarnessModelMeta & {
  available: boolean
  missingKey: string | null
}

export type ProvidersSnapshot = {
  providers: ProviderKeyStatus[]
  models: ModelAvailability[]
  serviceableCount: number
}

async function configuredEnvNames(): Promise<Set<string>> {
  const statuses = await listProviderKeyStatuses()
  const set = new Set<string>()
  for (const s of statuses) {
    if (!s.configured) continue
    set.add(s.envName)
    const def = PROVIDER_DEFS.find((p) => p.envName === s.envName)
    for (const a of def?.aliases || []) set.add(a)
  }
  // Ollama only when an explicit non-local URL/key is configured
  const ollama = await resolveProviderKey('OLLAMA_BASE_URL')
  if (ollama || process.env.OLLAMA_BASE_URL) {
    set.add('OLLAMA_BASE_URL')
  }
  return set
}

export function modelServiceable(
  meta: HarnessModelMeta,
  configured: Set<string>,
  airGapped: boolean
): boolean {
  if (airGapped) {
    return meta.airGapSafe && configured.has(meta.requiresKey)
  }
  return configured.has(meta.requiresKey)
}

export async function getProvidersSnapshot(
  airGapped: boolean
): Promise<ProvidersSnapshot> {
  const providers = await listProviderKeyStatuses()
  const configured = await configuredEnvNames()

  const catalog = airGapped
    ? HARNESS_MODEL_CATALOG.filter((m) => m.airGapSafe)
    : HARNESS_MODEL_CATALOG

  const models: ModelAvailability[] = catalog.map((m) => {
    const available = modelServiceable(m, configured, airGapped)
    return {
      ...m,
      available,
      missingKey: available ? null : m.requiresKey,
    }
  })

  return {
    providers,
    models,
    serviceableCount: models.filter((m) => m.available).length,
  }
}

export async function validateProviderKey(
  envName: string,
  apiKey: string
): Promise<{ ok: boolean; detail: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, detail: 'المفتاح فارغ' }

  try {
    switch (envName) {
      case 'OPENROUTER_API_KEY': {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        })
        return {
          ok: res.ok,
          detail: res.ok ? 'صالح' : `رفض المزوّد (${res.status})`,
        }
      }
      case 'GEMINI_API_KEY': {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
        )
        return {
          ok: res.ok,
          detail: res.ok ? 'صالح' : `رفض المزوّد (${res.status})`,
        }
      }
      case 'OPENAI_API_KEY': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        })
        return {
          ok: res.ok,
          detail: res.ok ? 'صالح' : `رفض المزوّد (${res.status})`,
        }
      }
      case 'GROQ_API_KEY': {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        })
        return {
          ok: res.ok,
          detail: res.ok ? 'صالح' : `رفض المزوّد (${res.status})`,
        }
      }
      case 'HF_TOKEN': {
        const res = await fetch('https://huggingface.co/api/whoami-v2', {
          headers: { Authorization: `Bearer ${key}` },
        })
        return {
          ok: res.ok,
          detail: res.ok ? 'صالح' : `رفض المزوّد (${res.status})`,
        }
      }
      case 'GLM_API_KEY': {
        const base =
          process.env.GLM_BASE_URL || 'https://api.z.ai/api/paas/v4'
        const res = await fetch(`${base.replace(/\/$/, '')}/models`, {
          headers: { Authorization: `Bearer ${key}` },
        })
        // Some GLM endpoints don't expose /models — accept 401/404 nuance
        if (res.ok || res.status === 404) {
          return { ok: true, detail: res.ok ? 'صالح' : 'مقبول (لا قائمة نماذج)' }
        }
        return {
          ok: res.status !== 401 && res.status !== 403,
          detail: `استجابة ${res.status}`,
        }
      }
      case 'PERPLEXITY_API_KEY':
        return { ok: key.length > 8, detail: 'مُخزَّن (بدون فحص حي)' }
      case 'OLLAMA_BASE_URL': {
        const base = key.replace(/\/$/, '').replace(/\/v1$/, '')
        const res = await fetch(`${base}/api/tags`, {
          signal: AbortSignal.timeout(4000),
        })
        return {
          ok: res.ok,
          detail: res.ok ? 'متصل' : `تعذر الاتصال (${res.status})`,
        }
      }
      default:
        return { ok: key.length > 4, detail: 'مُخزَّن' }
    }
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : 'فشل التحقق',
    }
  }
}
