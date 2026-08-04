'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  HarnessModelSlug,
  listAvailableHarnessModels,
} from '@/lib/ai/harness-catalog'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'

type ModelAvailRow = { slug: string; available: boolean; labelAr?: string }

/**
 * Shows only models whose provider key is present AND live-verified.
 * Blocked models stay out of the list until an API key is added in «مفاتيح API».
 */
export function ModelPicker({
  airGapped = false,
  compact,
}: {
  airGapped?: boolean
  compact?: boolean
}) {
  const { selectedModel, setSelectedModel } = useModelPickerStore()
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
      // Before probe finishes: show keys commonly set on this site
      return catalog.filter(
        (m) =>
          m.provider === 'google' ||
          m.provider === 'glm' ||
          m.slug.startsWith('claude')
      )
    }
    return catalog.filter((m) => availableSlugs.has(m.slug))
  }, [catalog, availableSlugs])

  useEffect(() => {
    if (!loaded || !availableSlugs) return
    if (availableSlugs.has(selectedModel)) return
    const fallback = readyModels[0]?.slug
    if (fallback) setSelectedModel(fallback as HarnessModelSlug)
  }, [loaded, availableSlugs, selectedModel, readyModels, setSelectedModel])

  return (
    <label
      className={
        compact
          ? 'flex items-center gap-1 text-[11px] text-stone-600'
          : 'flex items-center gap-2 text-sm'
      }
    >
      {!compact && <span className="shrink-0">النموذج</span>}
      <select
        aria-label="النموذج"
        className={
          compact
            ? 'max-w-[9.5rem] truncate rounded-md border border-ab-border bg-white px-1.5 py-1 text-[11px]'
            : 'max-w-[220px] rounded-md border border-ab-border bg-white px-3 py-1.5'
        }
        value={
          readyModels.some((m) => m.slug === selectedModel)
            ? selectedModel
            : readyModels[0]?.slug || ''
        }
        onChange={(e) =>
          setSelectedModel(e.target.value as HarnessModelSlug)
        }
        disabled={readyModels.length === 0}
      >
        {readyModels.length === 0 ? (
          <option value="">
            {loaded ? 'لا نموذج جاهز — أضف مفتاحاً' : 'جاري فحص المفاتيح…'}
          </option>
        ) : (
          readyModels.map((m) => (
            <option key={m.slug} value={m.slug}>
              {compact
                ? m.labelAr
                : `${m.labelAr}${m.labelEn ? ` · ${m.labelEn}` : ''}`}
            </option>
          ))
        )}
      </select>
    </label>
  )
}
