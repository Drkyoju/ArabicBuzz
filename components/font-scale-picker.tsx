'use client'

import { useEffect, useState } from 'react'
import { HelpTip } from '@/components/help-tip'
import {
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  applyFontScale,
  fontScalePercentLabel,
  persistFontScale,
  readStoredFontScale,
} from '@/lib/ui/font-scale'
import { cn } from '@/lib/utils'

/**
 * Font size zoom (حجم الخط) — A− / A+.
 * Distinct from EffortPicker القوة (منخفضة…عالية).
 */
export function FontScalePicker({
  compact,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const [scale, setScale] = useState(FONT_SCALE_DEFAULT)

  useEffect(() => {
    const saved = readStoredFontScale()
    setScale(saved)
    applyFontScale(saved)
  }, [])

  const commit = (next: number) => {
    const clamped = applyFontScale(next)
    setScale(clamped)
    persistFontScale(clamped)
  }

  const canMinus = scale > FONT_SCALE_MIN + 0.001
  const canPlus = scale < FONT_SCALE_MAX - 0.001

  return (
    <div
      className={cn(
        compact ? 'flex flex-col gap-0.5' : 'flex flex-col gap-1',
        className
      )}
    >
      <span className="ab-toolbar-label">
        حجم الخط
        <HelpTip textAr="كبّر أو صغّر نص الدردشة من أ+ / أ− — يُحفظ اختيارك تلقائياً." />
      </span>
      <div
        role="group"
        aria-label="حجم خط الدردشة"
        className="ab-seg"
        title="كبّر أو صغّر نص الدردشة من أ+ / أ−"
      >
        <button
          type="button"
          disabled={!canMinus}
          aria-label="تصغير الخط"
          title="تصغير الخط"
          onClick={() => commit(scale - FONT_SCALE_STEP)}
          className={cn(
            'ab-seg-item font-semibold disabled:opacity-40',
            compact ? 'px-1.5 py-1 text-[10px] sm:text-[11px]' : 'px-2 py-1'
          )}
        >
          أ−
        </button>
        <span
          className={cn(
            'min-w-[2.5rem] px-1 text-center tabular-nums text-ab-muted',
            compact ? 'text-[10px] sm:text-[11px]' : 'text-[11px]'
          )}
          aria-live="polite"
        >
          {fontScalePercentLabel(scale)}
        </span>
        <button
          type="button"
          disabled={!canPlus}
          aria-label="تكبير الخط"
          title="تكبير الخط"
          onClick={() => commit(scale + FONT_SCALE_STEP)}
          className={cn(
            'ab-seg-item font-semibold disabled:opacity-40',
            compact ? 'px-1.5 py-1 text-[10px] sm:text-[11px]' : 'px-2 py-1'
          )}
        >
          أ+
        </button>
        {Math.abs(scale - FONT_SCALE_DEFAULT) > 0.001 && (
          <button
            type="button"
            aria-label="إعادة الحجم الافتراضي"
            title="افتراضي"
            onClick={() => commit(FONT_SCALE_DEFAULT)}
            className={cn(
              'ab-seg-item text-ab-muted',
              compact ? 'px-1.5 py-1 text-[9px] sm:text-[10px]' : 'px-1.5 py-1 text-[10px]'
            )}
          >
            ١٠٠٪
          </button>
        )}
      </div>
    </div>
  )
}

/** Hydrate --ab-font-scale early (call once from workspace shell). */
export function hydrateFontScaleFromStorage(): number {
  return applyFontScale(readStoredFontScale())
}
