'use client'

import { useEffect, useState } from 'react'
import { HelpTip } from '@/components/help-tip'
import {
  FONT_SCALE_CSS_VAR,
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  FONT_SCALE_STORAGE_KEY,
  applyFontScale,
  fontScalePercentLabel,
  persistFontScale,
  readStoredFontScale,
} from '@/lib/ui/font-scale'
import { cn } from '@/lib/utils'

/**
 * Font size zoom (حجم الخط) — A− / A+.
 * Distinct from EffortPicker القوة (منخفضة…عالية).
 * Pass storageKey/cssVar to scope zoom (e.g. mail vs room chat).
 */
export function FontScalePicker({
  compact,
  className,
  storageKey = FONT_SCALE_STORAGE_KEY,
  cssVar = FONT_SCALE_CSS_VAR,
  applyToDocument = true,
  labelAr = 'حجم الخط',
  helpTextAr = 'كبّر أو صغّر نص الدردشة من أ+ / أ− — يُحفظ اختيارك تلقائياً.',
  ariaLabelAr = 'حجم خط الدردشة',
  onScaleChange,
}: {
  compact?: boolean
  className?: string
  storageKey?: string
  cssVar?: string
  /** When false, only notifies via onScaleChange (caller sets CSS var on a panel). */
  applyToDocument?: boolean
  labelAr?: string
  helpTextAr?: string
  ariaLabelAr?: string
  onScaleChange?: (scale: number) => void
}) {
  const [scale, setScale] = useState(FONT_SCALE_DEFAULT)

  useEffect(() => {
    const saved = readStoredFontScale(storageKey)
    setScale(saved)
    if (applyToDocument) {
      applyFontScale(saved, { cssVar })
    }
    onScaleChange?.(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per key
  }, [storageKey, cssVar, applyToDocument])

  const commit = (next: number) => {
    const clamped = applyToDocument
      ? applyFontScale(next, { cssVar })
      : clampOnly(next)
    setScale(clamped)
    persistFontScale(clamped, storageKey)
    onScaleChange?.(clamped)
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
        {labelAr}
        <HelpTip textAr={helpTextAr} />
      </span>
      <div
        role="group"
        aria-label={ariaLabelAr}
        className="ab-seg"
        title={helpTextAr}
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
              compact
                ? 'px-1.5 py-1 text-[9px] sm:text-[10px]'
                : 'px-1.5 py-1 text-[10px]'
            )}
          >
            ١٠٠٪
          </button>
        )}
      </div>
    </div>
  )
}

function clampOnly(n: number): number {
  return applyFontScale(n, { el: null })
}

/** Hydrate --ab-font-scale early (call once from workspace shell). */
export function hydrateFontScaleFromStorage(): number {
  return applyFontScale(readStoredFontScale())
}
