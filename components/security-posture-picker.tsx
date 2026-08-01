'use client'

import {
  POSTURE_LABELS_AR,
  type SecurityPostureMode,
} from '@/lib/security/posture'
import { useSecurityPostureStore } from '@/lib/security/posture-store'
import { cn } from '@/lib/utils'

const MODES: SecurityPostureMode[] = ['STRICT', 'AUTO', 'DANGEROUS']

export function SecurityPosturePicker({
  className,
  compact,
}: {
  className?: string
  compact?: boolean
}) {
  const posture = useSecurityPostureStore((s) => s.posture)
  const setPosture = useSecurityPostureStore((s) => s.setPosture)

  return (
    <div className={cn(className)} dir="rtl">
      {!compact && (
        <label className="mb-2 block text-xs font-medium text-stone-500">
          وضع الأمان
        </label>
      )}
      <div className={cn('flex flex-wrap gap-1.5', compact && 'gap-1')}>
        {MODES.map((mode) => {
          const active = posture === mode
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setPosture(mode)}
              title={POSTURE_LABELS_AR[mode]}
              className={cn(
                'rounded-md border text-[11px] transition-colors',
                compact ? 'px-1.5 py-1' : 'px-2 py-1',
                active
                  ? mode === 'DANGEROUS'
                    ? 'border-ab-warn bg-ab-warn/15 font-semibold text-ab-warn'
                    : mode === 'STRICT'
                      ? 'border-ab-accent bg-ab-accent/10 font-semibold text-ab-accent'
                      : 'border-ab-accent bg-ab-accent text-white font-semibold'
                  : 'border-ab-border bg-white text-stone-600 hover:bg-stone-50'
              )}
            >
              {mode === 'STRICT'
                ? 'صارم'
                : mode === 'AUTO'
                  ? 'تلقائي'
                  : 'حر'}
            </button>
          )
        })}
      </div>
      {!compact && (
        <p className="mt-1.5 text-[11px] text-stone-500">
          {POSTURE_LABELS_AR[posture]}
        </p>
      )}
    </div>
  )
}
