'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  HarnessModelSlug,
  HarnessTier,
  listAvailableHarnessModels,
  tiersForModels,
} from '@/lib/ai/harness-catalog'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'

type ModelAvailRow = {
  slug: string
  available: boolean
  labelAr?: string
  blockedReasonAr?: string | null
  provider?: string
}

const KIMI_SLUG = 'moonshotai/kimi-k3-free'

/**
 * Three capability tiers (سريع / متوازن / أعلى دقة). Provider model names stay
 * in the subtitle and tooltip so the picker never reads like an engineering menu.
 * Exhausted TokenRouter/Kimi is shown disabled with «رصيد منتهٍ» — not selectable.
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
  const [kimiBlocked, setKimiBlocked] = useState<{
    show: boolean
    reasonAr: string
  } | null>(null)
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
        const kimi = d.models.find((m) => m.slug === KIMI_SLUG)
        if (kimi && !kimi.available) {
          const reason = kimi.blockedReasonAr || ''
          const exhausted = /رصيد|منته|quota|RemainQuota/i.test(reason)
          setKimiBlocked({
            show: true,
            reasonAr: exhausted
              ? 'رصيد منتهٍ'
              : reason.includes('أضف')
                ? 'غير مضبوط'
                : 'غير متاح',
          })
        } else {
          setKimiBlocked(null)
        }
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

  const tiers = useMemo(() => tiersForModels(readyModels), [readyModels])

  const selectedTier: HarnessTier | '' = useMemo(() => {
    const exact = readyModels.find((m) => m.slug === selectedModel)
    if (exact && tiers.some((t) => t.tier === exact.tier)) return exact.tier
    return tiers[0]?.tier || ''
  }, [readyModels, selectedModel, tiers])

  const activeTier = tiers.find((t) => t.tier === selectedTier)

  useEffect(() => {
    if (!loaded || !availableSlugs) return
    if (availableSlugs.has(selectedModel)) return
    // Never keep a dead Kimi selection
    const fallback = tiers[0]?.model.slug
    if (fallback) setSelectedModel(fallback as HarnessModelSlug)
  }, [loaded, availableSlugs, selectedModel, tiers, setSelectedModel])

  const currentModelName =
    readyModels.find((m) => m.slug === selectedModel)?.labelEn ||
    activeTier?.model.labelEn ||
    ''

  return (
    <label
      className={
        compact
          ? 'flex max-w-[11rem] flex-col gap-0.5 text-[10px] text-stone-500'
          : 'flex flex-col gap-1 text-sm'
      }
      title={
        activeTier
          ? `${activeTier.labelAr} — ${activeTier.hintAr}${
              currentModelName ? ` (${currentModelName})` : ''
            }`
          : 'اختر قدرة الرد'
      }
    >
      <span className={compact ? 'sr-only' : 'text-[11px] text-stone-500'}>
        قدرة الرد
      </span>
      <select
        aria-label="قدرة الرد"
        className={
          compact
            ? 'max-w-[11rem] truncate rounded-md border border-ab-border bg-white px-1.5 py-1 text-[11px]'
            : 'max-w-[240px] rounded-md border border-ab-border bg-white px-3 py-1.5'
        }
        value={selectedTier}
        onChange={(e) => {
          const next = tiers.find((t) => t.tier === e.target.value)
          if (next) setSelectedModel(next.model.slug)
        }}
        disabled={tiers.length === 0}
      >
        {tiers.length === 0 ? (
          <option value="">
            {loaded ? 'لا قدرة جاهزة — أضف مفتاحاً' : 'جاري فحص المفاتيح…'}
          </option>
        ) : (
          tiers.map((t) => (
            <option key={t.tier} value={t.tier} title={t.model.labelEn}>
              {t.labelAr}
            </option>
          ))
        )}
      </select>
      {kimiBlocked?.show && (
        <span
          className={
            compact
              ? 'truncate text-[9px] text-amber-700'
              : 'text-[10px] text-amber-700'
          }
          title="Kimi Free عبر TokenRouter غير قابل للاختيار حالياً"
        >
          Kimi Free · {kimiBlocked.reasonAr}
        </span>
      )}
      {!compact && currentModelName && (
        <span className="text-[10px] text-stone-400" dir="ltr">
          {currentModelName}
        </span>
      )}
    </label>
  )
}
