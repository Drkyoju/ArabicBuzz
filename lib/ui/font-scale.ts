/** Persisted UI font zoom — room chat (and optional workspace) via CSS var. */

export const FONT_SCALE_STORAGE_KEY = 'ab-font-scale'
export const FONT_SCALE_CSS_VAR = '--ab-font-scale'

/** Unitless multiplier on root font metrics for room chat. */
export const FONT_SCALE_MIN = 0.9
export const FONT_SCALE_MAX = 1.4
export const FONT_SCALE_DEFAULT = 1
export const FONT_SCALE_STEP = 0.05

export function clampFontScale(n: number): number {
  if (!Number.isFinite(n)) return FONT_SCALE_DEFAULT
  const stepped = Math.round(n / FONT_SCALE_STEP) * FONT_SCALE_STEP
  return Math.min(
    FONT_SCALE_MAX,
    Math.max(FONT_SCALE_MIN, Math.round(stepped * 100) / 100)
  )
}

export function applyFontScale(scale: number): number {
  const next = clampFontScale(scale)
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(
      FONT_SCALE_CSS_VAR,
      String(next)
    )
  }
  return next
}

export function readStoredFontScale(): number {
  if (typeof window === 'undefined') return FONT_SCALE_DEFAULT
  try {
    const raw = window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)
    if (!raw) return FONT_SCALE_DEFAULT
    return clampFontScale(Number(raw))
  } catch {
    return FONT_SCALE_DEFAULT
  }
}

export function persistFontScale(scale: number): void {
  const next = clampFontScale(scale)
  try {
    window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(next))
  } catch {
    /* ignore quota / private mode */
  }
}

export function fontScalePercentLabel(scale: number): string {
  return `${Math.round(clampFontScale(scale) * 100)}٪`
}
