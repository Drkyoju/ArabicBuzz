'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  HarnessModelSlug,
  listAvailableHarnessModels,
} from '@/lib/ai/harness-catalog'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'

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

  useEffect(() => {
    let cancelled = false
    void fetch('/api/settings/providers')
      .then((r) => r.json())
      .then((d: { models?: Array<{ slug: string; available: boolean }> }) => {
        if (cancelled || !Array.isArray(d.models)) return
        setAvailableSlugs(
          new Set(d.models.filter((m) => m.available).map((m) => m.slug))
        )
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [airGapped])

  const models = useMemo(() => {
    if (!availableSlugs) return catalog
    return [
      ...catalog.filter((m) => availableSlugs.has(m.slug)),
      ...catalog.filter((m) => !availableSlugs.has(m.slug)),
    ]
  }, [catalog, availableSlugs])

  return (
    <label
      className={
        compact
          ? 'flex items-center gap-1.5 text-[11px] text-stone-600'
          : 'flex items-center gap-2 text-sm'
      }
    >
      <span className="shrink-0">النموذج</span>
      <select
        className={
          compact
            ? 'max-w-[11rem] rounded-md border border-ab-border bg-white px-2 py-1 text-[11px]'
            : 'max-w-[220px] rounded-md border border-ab-border bg-white px-3 py-1.5'
        }
        value={selectedModel}
        onChange={(e) =>
          setSelectedModel(e.target.value as HarnessModelSlug)
        }
      >
        {models.map((m) => {
          const ok = !availableSlugs || availableSlugs.has(m.slug)
          return (
            <option key={m.slug} value={m.slug} disabled={!ok}>
              {ok
                ? `${m.labelAr} · ${m.provider}`
                : `${m.labelAr} · يحتاج مفتاحاً`}
            </option>
          )
        })}
      </select>
    </label>
  )
}
