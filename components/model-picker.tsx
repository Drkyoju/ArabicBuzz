'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  HarnessModelSlug,
  HARNESS_TIER_LABELS_AR,
  listAvailableHarnessModels,
} from '@/lib/ai/harness-catalog'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'
import { HelpTip } from '@/components/help-tip'
import { cn } from '@/lib/utils'

type ModelAvailRow = {
  slug: string
  available: boolean
  labelAr?: string
  blockedReasonAr?: string | null
  provider?: string
}

const PROVIDER_LABEL_AR: Record<string, string> = {
  google: 'Gemini',
  glm: 'GLM',
  agentrouter: 'AgentRouter',
  ollama: 'محلي',
}

/**
 * Model dropdown — working Gemini / GLM / AgentRouter models only
 * (availability from `/api/settings/providers`).
 */
export function ModelPicker({
  airGapped = false,
  compact,
  scopeId,
  className,
}: {
  airGapped?: boolean
  compact?: boolean
  /** When set, selection persists per room + globally. */
  scopeId?: string | null
  className?: string
}) {
  const selectedModel = useModelPickerStore((s) =>
    scopeId ? s.resolveForScope(scopeId).model : s.selectedModel
  )
  const setSelectedModel = useModelPickerStore((s) => s.setSelectedModel)
  const catalog = listAvailableHarnessModels(airGapped)
  const [availableSlugs, setAvailableSlugs] = useState<Set<string> | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/settings/providers')
      .then((r) => r.json())
      .then((d: { models?: ModelAvailRow[] }) => {
        if (cancelled || !Array.isArray(d.models)) return
        const ok = new Set(
          d.models.filter((m) => m.available).map((m) => m.slug)
        )
        setAvailableSlugs(ok)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [airGapped])

  const readyModels = useMemo(() => {
    if (!availableSlugs) {
      return catalog.filter(
        (m) =>
          m.provider === 'google' ||
          m.provider === 'glm' ||
          m.provider === 'agentrouter'
      )
    }
    return catalog.filter((m) => availableSlugs.has(m.slug))
  }, [catalog, availableSlugs])

  useEffect(() => {
    if (!loaded || !availableSlugs) return
    if (availableSlugs.has(selectedModel)) return
    const fallback = readyModels[0]?.slug
    if (fallback) setSelectedModel(fallback as HarnessModelSlug, scopeId)
  }, [
    loaded,
    availableSlugs,
    selectedModel,
    readyModels,
    setSelectedModel,
    scopeId,
  ])

  const active = readyModels.find((m) => m.slug === selectedModel)

  return (
    <label
      className={cn(
        compact
          ? 'flex min-w-0 max-w-[14rem] flex-col gap-0.5'
          : 'flex min-w-0 flex-col gap-1',
        className
      )}
      title={
        active
          ? `${active.labelEn} — ${HARNESS_TIER_LABELS_AR[active.tier]}`
          : 'اختر النموذج'
      }
    >
      <span className="ab-toolbar-label">
        النموذج
        <HelpTip textAr="اختر نموذج الرد (Gemini / GLM / AgentRouter). يظهر فقط المزوّدون الذين لديهم مفتاح يعمل." />
      </span>
      <select
        aria-label="النموذج"
        dir="rtl"
        className={cn(
          'ab-select',
          compact ? 'px-1.5 py-1 text-[11px]' : 'max-w-[280px] px-3 py-1.5 text-sm'
        )}
        value={
          readyModels.some((m) => m.slug === selectedModel)
            ? selectedModel
            : readyModels[0]?.slug || ''
        }
        onChange={(e) => {
          const slug = e.target.value as HarnessModelSlug
          if (slug) setSelectedModel(slug, scopeId)
        }}
        disabled={readyModels.length === 0}
      >
        {readyModels.length === 0 ? (
          <option value="">
            {loaded ? 'لا نموذج جاهز — أضف مفتاحاً' : 'جاري فحص المفاتيح…'}
          </option>
        ) : (
          readyModels.map((m) => (
            <option key={m.slug} value={m.slug} title={m.slug}>
              {PROVIDER_LABEL_AR[m.provider] || m.provider} · {m.labelEn} (
              {HARNESS_TIER_LABELS_AR[m.tier]})
            </option>
          ))
        )}
      </select>
      {!compact && active && (
        <span className="text-[10px] text-ab-muted-soft" dir="ltr">
          {active.slug}
        </span>
      )}
    </label>
  )
}
