'use client'

import { create } from 'zustand'
import {
  HarnessModelSlug,
  HARNESS_MODEL_CATALOG,
} from '@/lib/ai/harness-catalog'

type ModelPickerState = {
  selectedModel: HarnessModelSlug
  setSelectedModel: (slug: HarnessModelSlug) => void
}

const DEFAULT_SLUG = (process.env.NEXT_PUBLIC_DEFAULT_HARNESS_MODEL ||
  'gemini-2.0-flash') as HarnessModelSlug

export const useModelPickerStore = create<ModelPickerState>((set) => ({
  selectedModel: HARNESS_MODEL_CATALOG.some((m) => m.slug === DEFAULT_SLUG)
    ? DEFAULT_SLUG
    : 'gemini-2.0-flash',
  setSelectedModel: (slug) => set({ selectedModel: slug }),
}))
