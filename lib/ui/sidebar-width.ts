/** Shared desktop sidebar width — keep aside + main offset in sync via CSS var. */

export const SIDEBAR_WIDTH_STORAGE_KEY = 'ab-sidebar-width'
export const SIDEBAR_WIDTH_CSS_VAR = '--ab-sidebar-width'

/** Default / min / max in rem (16px root assumed for clamp math). */
export const SIDEBAR_WIDTH_DEFAULT_REM = 15.5
export const SIDEBAR_WIDTH_MIN_REM = 12
export const SIDEBAR_WIDTH_MAX_REM = 22

const REM_PX = 16

export const SIDEBAR_WIDTH_DEFAULT_PX = SIDEBAR_WIDTH_DEFAULT_REM * REM_PX
export const SIDEBAR_WIDTH_MIN_PX = SIDEBAR_WIDTH_MIN_REM * REM_PX
export const SIDEBAR_WIDTH_MAX_PX = SIDEBAR_WIDTH_MAX_REM * REM_PX

export function clampSidebarWidthPx(px: number): number {
  if (!Number.isFinite(px)) return SIDEBAR_WIDTH_DEFAULT_PX
  return Math.min(
    SIDEBAR_WIDTH_MAX_PX,
    Math.max(SIDEBAR_WIDTH_MIN_PX, Math.round(px))
  )
}

export function applySidebarWidthPx(px: number): number {
  const next = clampSidebarWidthPx(px)
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(
      SIDEBAR_WIDTH_CSS_VAR,
      `${next}px`
    )
  }
  return next
}

export function readStoredSidebarWidthPx(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    if (!raw) return null
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    return clampSidebarWidthPx(n)
  } catch {
    return null
  }
}

export function persistSidebarWidthPx(px: number): void {
  const next = clampSidebarWidthPx(px)
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next))
  } catch {
    /* ignore quota / private mode */
  }
}

/** Width from pointer relative to the aside’s inline-start edge (RTL-safe). */
export function sidebarWidthFromClientX(
  clientX: number,
  asideEl: HTMLElement
): number {
  const rect = asideEl.getBoundingClientRect()
  const rtl =
    getComputedStyle(document.documentElement).direction === 'rtl'
  return clampSidebarWidthPx(rtl ? rect.right - clientX : clientX - rect.left)
}
