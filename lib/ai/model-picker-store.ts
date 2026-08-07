'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  HarnessModelSlug,
  HARNESS_MODEL_CATALOG,
} from '@/lib/ai/harness-catalog'
import { parseRunEffort, type RunEffort } from '@/lib/ai/run-effort'

type ScopePrefs = {
  model?: HarnessModelSlug
  effort?: RunEffort
}

type ModelPickerState = {
  selectedModel: HarnessModelSlug
  effort: RunEffort
  /** Per-room overrides (scopeId → prefs). */
  byScope: Record<string, ScopePrefs>
  setSelectedModel: (slug: HarnessModelSlug, scopeId?: string | null) => void
  setEffort: (effort: RunEffort, scopeId?: string | null) => void
  /** Resolve model + effort for a room (scope override → global). */
  resolveForScope: (scopeId?: string | null) => {
    model: HarnessModelSlug
    effort: RunEffort
  }
}

const DEFAULT_SLUG = (process.env.NEXT_PUBLIC_DEFAULT_HARNESS_MODEL ||
  'gemini-3.1-pro') as HarnessModelSlug

function isKnownSlug(slug: string): slug is HarnessModelSlug {
  return HARNESS_MODEL_CATALOG.some((m) => m.slug === slug)
}

const fallbackSlug: HarnessModelSlug = HARNESS_MODEL_CATALOG.some(
  (m) => m.slug === DEFAULT_SLUG
)
  ? DEFAULT_SLUG
  : 'gemini-3.1-pro'

export const useModelPickerStore = create<ModelPickerState>()(
  persist(
    (set, get) => ({
      selectedModel: fallbackSlug,
      effort: 'MEDIUM',
      byScope: {},
      setSelectedModel: (slug, scopeId) =>
        set((s) => {
          if (!scopeId) return { selectedModel: slug }
          return {
            selectedModel: slug,
            byScope: {
              ...s.byScope,
              [scopeId]: { ...s.byScope[scopeId], model: slug },
            },
          }
        }),
      setEffort: (effort, scopeId) =>
        set((s) => {
          if (!scopeId) return { effort }
          return {
            effort,
            byScope: {
              ...s.byScope,
              [scopeId]: { ...s.byScope[scopeId], effort },
            },
          }
        }),
      resolveForScope: (scopeId) => {
        const s = get()
        const scoped = scopeId ? s.byScope[scopeId] : undefined
        const model =
          scoped?.model && isKnownSlug(scoped.model)
            ? scoped.model
            : isKnownSlug(s.selectedModel)
              ? s.selectedModel
              : fallbackSlug
        const effort = parseRunEffort(scoped?.effort ?? s.effort)
        return { model, effort }
      },
    }),
    {
      name: 'ab-model-picker',
      version: 2,
      partialize: (s) => ({
        selectedModel: s.selectedModel,
        effort: s.effort,
        byScope: s.byScope,
      }),
      migrate: (persisted) => {
        const p = (persisted || {}) as Partial<ModelPickerState>
        const model =
          p.selectedModel && isKnownSlug(p.selectedModel)
            ? p.selectedModel
            : fallbackSlug
        return {
          selectedModel: model,
          effort: parseRunEffort(p.effort),
          byScope: p.byScope && typeof p.byScope === 'object' ? p.byScope : {},
        }
      },
    }
  )
)
