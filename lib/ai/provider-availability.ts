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
  /** Why the model is blocked (Arabic). */
  blockedReasonAr?: string | null
}

export type ProviderLiveStatus = ProviderKeyStatus & {
  /** null = not probed (e.g. absent). */
  liveOk: boolean | null
  liveDetail?: string
}

export type ProvidersSnapshot = {
  providers: ProviderLiveStatus[]
  models: ModelAvailability[]
  serviceableCount: number
  probedAt: string | null
}

type ProbeEntry = { ok: boolean; detail: string; at: number }

const probeCache = new Map<string, ProbeEntry>()
const PROBE_TTL_MS = 5 * 60 * 1000

export function clearProviderProbeCache(envName?: string) {
  if (envName) probeCache.delete(envName)
  else probeCache.clear()
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
  const ollama = await resolveProviderKey('OLLAMA_BASE_URL')
  if (ollama || process.env.OLLAMA_BASE_URL) {
    set.add('OLLAMA_BASE_URL')
  }
  return set
}

export function modelServiceable(
  meta: HarnessModelMeta,
  configured: Set<string>,
  airGapped: boolean,
  liveByEnv?: Map<string, boolean | null>
): boolean {
  if (airGapped) {
    if (!(meta.airGapSafe && configured.has(meta.requiresKey))) return false
  } else if (!configured.has(meta.requiresKey)) {
    return false
  }
  if (liveByEnv) {
    const live = liveByEnv.get(meta.requiresKey)
    if (live === false) return false
  }
  return true
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
        if (key.startsWith('eyJ')) {
          return { ok: false, detail: 'يبدو مفتاح جلسة وليس OpenRouter' }
        }
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        return {
          ok: res.ok,
          detail: res.ok ? 'صالح' : `رفض المزوّد (${res.status})`,
        }
      }
      case 'GEMINI_API_KEY': {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
          { signal: AbortSignal.timeout(8000) }
        )
        return {
          ok: res.ok,
          detail: res.ok ? 'صالح' : `رفض المزوّد (${res.status})`,
        }
      }
      case 'OPENAI_API_KEY': {
        // Reject JWT-looking secrets (common mis-paste of Supabase tokens)
        if (key.startsWith('eyJ')) {
          return { ok: false, detail: 'يبدو مفتاح جلسة وليس OpenAI' }
        }
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        return {
          ok: res.ok,
          detail: res.ok ? 'صالح' : `رفض المزوّد (${res.status})`,
        }
      }
      case 'GROQ_API_KEY': {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        return {
          ok: res.ok,
          detail: res.ok ? 'صالح' : `رفض المزوّد (${res.status})`,
        }
      }
      case 'HF_TOKEN': {
        const res = await fetch('https://huggingface.co/api/whoami-v2', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        return {
          ok: res.ok,
          detail: res.ok ? 'صالح' : `رفض المزوّد (${res.status})`,
        }
      }
      case 'GLM_API_KEY': {
        const base =
          process.env.GLM_BASE_URL ||
          'https://api.z.ai/api/coding/paas/v4'
        const root = base.replace(/\/$/, '')
        // Coding Pro quota is on /api/coding/paas/v4 — pay-as-you-go /api/paas/v4 returns 1113.
        const chat = await fetch(`${root}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.GLM_PROBE_MODEL || 'glm-4.5',
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(25000),
        })
        if (chat.ok) return { ok: true, detail: 'صالح (Coding Plan)' }
        let detail = `مرفوض (${chat.status})`
        try {
          const body = (await chat.json()) as {
            error?: { code?: string | number; message?: string }
            message?: string
          }
          const code = body.error?.code
          const msg = body.error?.message || body.message || ''
          if (String(code) === '1113' || /balance|resource package|余额/i.test(msg)) {
            detail =
              'باقة Coding Plan لا تُحسب على /api/paas — استخدم GLM_BASE_URL=…/coding/paas/v4'
          } else if (msg) {
            detail = msg.slice(0, 80)
          }
        } catch {
          /* ignore */
        }
        return { ok: false, detail }
      }
      case 'PERPLEXITY_API_KEY': {
        if (key.startsWith('eyJ')) {
          return { ok: false, detail: 'يبدو مفتاح جلسة وليس Perplexity' }
        }
        const res = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(10000),
        })
        return {
          ok: res.ok || res.status === 400,
          detail: res.ok || res.status === 400 ? 'صالح' : `رفض (${res.status})`,
        }
      }
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

async function probeConfiguredKeys(
  statuses: ProviderKeyStatus[],
  forceFresh: boolean
): Promise<Map<string, ProbeEntry>> {
  const out = new Map<string, ProbeEntry>()
  const now = Date.now()
  await Promise.all(
    statuses
      .filter((s) => s.configured)
      .map(async (s) => {
        const cached = probeCache.get(s.envName)
        if (
          !forceFresh &&
          cached &&
          now - cached.at < PROBE_TTL_MS
        ) {
          out.set(s.envName, cached)
          return
        }
        const key = await resolveProviderKey(s.envName)
        const result = await validateProviderKey(s.envName, key)
        const entry: ProbeEntry = {
          ok: result.ok,
          detail: result.detail,
          at: now,
        }
        probeCache.set(s.envName, entry)
        out.set(s.envName, entry)
      })
  )
  return out
}

export async function getProvidersSnapshot(
  airGapped: boolean,
  opts?: { fresh?: boolean }
): Promise<ProvidersSnapshot> {
  const providersBase = await listProviderKeyStatuses()
  const configured = await configuredEnvNames()
  const probes = await probeConfiguredKeys(
    providersBase,
    Boolean(opts?.fresh)
  )

  const liveByEnv = new Map<string, boolean | null>()
  for (const def of PROVIDER_DEFS) {
    if (!configured.has(def.envName)) {
      liveByEnv.set(def.envName, null)
      continue
    }
    const probe = probes.get(def.envName)
    liveByEnv.set(def.envName, probe ? probe.ok : null)
    for (const a of def.aliases || []) {
      liveByEnv.set(a, probe ? probe.ok : null)
    }
  }

  const providersForUi: ProviderLiveStatus[] = providersBase.map((p) => {
    const probe = probes.get(p.envName)
    return {
      ...p,
      liveOk: p.configured ? (probe ? probe.ok : null) : null,
      liveDetail: probe?.detail,
    }
  })

  const catalog = airGapped
    ? HARNESS_MODEL_CATALOG.filter((m) => m.airGapSafe)
    : HARNESS_MODEL_CATALOG

  const models: ModelAvailability[] = catalog.map((m) => {
    const hasKey = configured.has(m.requiresKey)
    const live = liveByEnv.get(m.requiresKey)
    const available = modelServiceable(m, configured, airGapped, liveByEnv)
    let blockedReasonAr: string | null = null
    if (!available) {
      if (!hasKey) blockedReasonAr = `أضف ${m.requiresKey} من صفحة مفاتيح API`
      else if (live === false)
        blockedReasonAr = `مفتاح ${m.requiresKey} مرفوض أو لا يستجيب`
      else blockedReasonAr = 'غير متاح'
    }
    return {
      ...m,
      available,
      missingKey: available ? null : m.requiresKey,
      blockedReasonAr,
    }
  })

  return {
    providers: providersForUi,
    models,
    serviceableCount: models.filter((m) => m.available).length,
    probedAt: new Date().toISOString(),
  }
}
