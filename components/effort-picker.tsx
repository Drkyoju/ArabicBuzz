'use client'

import {
  RUN_EFFORT_HINTS_AR,
  RUN_EFFORT_LABELS_AR,
  RUN_EFFORT_ORDER,
  type RunEffort,
} from '@/lib/ai/run-effort'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'
import { HelpTip } from '@/components/help-tip'
import { cn } from '@/lib/utils'

/**
 * Power / effort control: منخفضة | متوسطة | عالية | أقصى
 * Persists globally + per-scope when scopeId is provided.
 */
export function EffortPicker({
  scopeId,
  compact,
  className,
}: {
  scopeId?: string | null
  compact?: boolean
  className?: string
}) {
  const effort = useModelPickerStore((s) =>
    scopeId ? s.resolveForScope(scopeId).effort : s.effort
  )
  const setEffort = useModelPickerStore((s) => s.setEffort)

  return (
    <div
      className={cn(
        compact
          ? 'flex flex-col gap-0.5'
          : 'flex flex-col gap-1',
        className
      )}
    >
      <span className="ab-toolbar-label">
        القوة
        <HelpTip textAr="تتحكم بعدد خطوات الأدوات وعمق الرد: منخفضة أسرع، أقصى أعمق وأبطأ." />
      </span>
      <div
        role="radiogroup"
        aria-label="قوة التشغيل"
        className="ab-seg"
      >
        {RUN_EFFORT_ORDER.map((level) => {
          const active = effort === level
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              title={RUN_EFFORT_HINTS_AR[level]}
              onClick={() => setEffort(level as RunEffort, scopeId)}
              className={cn(
                'ab-seg-item',
                compact ? 'px-1.5 py-1 text-[10px] sm:text-[11px]' : 'px-2 py-1'
              )}
            >
              {RUN_EFFORT_LABELS_AR[level]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
