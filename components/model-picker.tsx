'use client'

import {
  HarnessModelSlug,
  listAvailableHarnessModels,
} from '@/lib/ai/harness-catalog'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'

export function ModelPicker({ airGapped = false }: { airGapped?: boolean }) {
  const { selectedModel, setSelectedModel } = useModelPickerStore()
  const models = listAvailableHarnessModels(airGapped)

  return (
    <label className="flex items-center gap-2 text-sm">
      <span>النموذج</span>
      <select
        className="max-w-[220px] rounded-md border border-ab-border bg-white px-3 py-1.5"
        value={selectedModel}
        onChange={(e) =>
          setSelectedModel(e.target.value as HarnessModelSlug)
        }
      >
        {models.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.labelAr} · {m.provider}
          </option>
        ))}
      </select>
    </label>
  )
}
