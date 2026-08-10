/** Persisted UI font zoom — room chat (and optional surfaces) via CSS var. */

export const FONT_SCALE_STORAGE_KEY = 'ab-font-scale'
export const FONT_SCALE_CSS_VAR = '--ab-font-scale'

/** Org mail reading / reply pane — independent of room chat zoom. */
export const MAIL_FONT_SCALE_STORAGE_KEY = 'ab-mail-font-scale'
export const MAIL_FONT_SCALE_CSS_VAR = '--ab-mail-font-scale'

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

export function applyFontScale(
  scale: number,
  opts?: { cssVar?: string; el?: HTMLElement | null }
): number {
  const next = clampFontScale(scale)
  const varName = opts?.cssVar || FONT_SCALE_CSS_VAR
  const target =
    opts?.el !== undefined
      ? opts.el
      : typeof document !== 'undefined'
        ? document.documentElement
        : null
  if (target) {
    target.style.setProperty(varName, String(next))
  }
  return next
}

export function readStoredFontScale(
  storageKey: string = FONT_SCALE_STORAGE_KEY
): number {
  if (typeof window === 'undefined') return FONT_SCALE_DEFAULT
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return FONT_SCALE_DEFAULT
    return clampFontScale(Number(raw))
  } catch {
    return FONT_SCALE_DEFAULT
  }
}

export function persistFontScale(
  scale: number,
  storageKey: string = FONT_SCALE_STORAGE_KEY
): void {
  const next = clampFontScale(scale)
  try {
    window.localStorage.setItem(storageKey, String(next))
  } catch {
    /* ignore quota / private mode */
  }
}

export function fontScalePercentLabel(scale: number): string {
  return `${Math.round(clampFontScale(scale) * 100)}٪`
}
