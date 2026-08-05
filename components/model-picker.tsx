'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  HarnessModelSlug,
  listAvailableHarnessModels,
} from '@/lib/ai/harness-catalog'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'

type ModelAvailRow = { slug: string; available: boolean; labelAr?: string }

/**
 * Capability / privacy framed picker (not engineer model names).
 * Advanced provider IDs stay in title tooltips only.
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
      return catalog.filter(
        (m) =>
          m.provider === 'google' ||
          m.provider === 'glm' ||
          m.provider === 'agentrouter' ||
          m.provider === 'tokenrouter' ||
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

  const selectedMeta = readyModels.find((m) => m.slug === selectedModel)

  return (
    <label
      className={
        compact
          ? 'flex max-w-[11rem] flex-col gap-0.5 text-[10px] text-stone-500'
          : 'flex flex-col gap-1 text-sm'
      }
      title={
        selectedMeta
          ? `${selectedMeta.labelAr} · ${selectedMeta.labelEn}`
          : 'اختر قدرة الرد'
      }
    >
      <span className={compact ? 'sr-only' : 'text-[11px] text-stone-500'}>
        قدرة الرد
      </span>
      <select
        aria-label="قدرة الرد والخصوصية"
        className={
          compact
            ? 'max-w-[11rem] truncate rounded-md border border-ab-border bg-white px-1.5 py-1 text-[11px]'
            : 'max-w-[240px] rounded-md border border-ab-border bg-white px-3 py-1.5'
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
            {loaded ? 'لا قدرة جاهزة — أضف مفتاحاً' : 'جاري فحص المفاتيح…'}
          </option>
        ) : (
          readyModels.map((m) => (
            <option key={m.slug} value={m.slug} title={m.labelEn}>
              {m.labelAr}
            </option>
          ))
        )}
      </select>
    </label>
  )
}
