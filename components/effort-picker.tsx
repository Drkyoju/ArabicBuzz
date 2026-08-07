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
      <span
        className={cn(
          'inline-flex items-center gap-1 font-medium text-stone-600',
          compact ? 'text-[10px]' : 'text-[11px]'
        )}
      >
        القوة
        <HelpTip textAr="تتحكم بعدد خطوات الأدوات وعمق الرد: منخفضة أسرع، أقصى أعمق وأبطأ." />
      </span>
      <div
        role="radiogroup"
        aria-label="قوة التشغيل"
        className="inline-flex flex-wrap gap-0.5 rounded-md border border-ab-border bg-white p-0.5"
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
                'rounded px-1.5 py-1 text-[10px] font-medium transition-colors sm:text-[11px]',
                active
                  ? 'bg-ab-accent text-white'
                  : 'text-stone-600 hover:bg-stone-50'
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
