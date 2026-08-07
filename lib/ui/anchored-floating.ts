/** Viewport-safe coords for composer / toolbar floating panels (RTL-aware). */

export type AnchoredFloatingCoords = {
  top: number
  left: number
  width: number
  maxHeight: number
}

/**
 * Place a panel near an anchor, preferring above + toward viewport center.
 * Clamps so the box never opens clipped off the left/right edge.
 */
export function coordsForAnchoredFloating(
  anchor: DOMRect,
  opts?: {
    /** Preferred panel width in px (default 320 = w-80). */
    width?: number
    /** Estimated height for vertical flip (default 280). */
    estimatedHeight?: number
    /** Gap from anchor in px. */
    gap?: number
    /** Minimum inset from viewport edges. */
    padding?: number
  }
): AnchoredFloatingCoords {
  const preferredW = opts?.width ?? 320
  const estimatedH = opts?.estimatedHeight ?? 280
  const gap = opts?.gap ?? 8
  const pad = opts?.padding ?? 8
  const vw = typeof window !== 'undefined' ? window.innerWidth : preferredW
  const vh = typeof window !== 'undefined' ? window.innerHeight : estimatedH

  const width = Math.min(preferredW, Math.max(160, vw - pad * 2))

  const spaceAbove = anchor.top - pad - gap
  const spaceBelow = vh - anchor.bottom - pad - gap
  const placeAbove =
    spaceAbove >= Math.min(estimatedH, 160) || spaceAbove >= spaceBelow

  let top: number
  let maxHeight: number
  if (placeAbove) {
    maxHeight = Math.max(120, Math.min(estimatedH, spaceAbove))
    top = anchor.top - gap - maxHeight
  } else {
    maxHeight = Math.max(120, Math.min(estimatedH, spaceBelow))
    top = anchor.bottom + gap
  }
  top = Math.min(Math.max(pad, top), vh - pad - 80)
  maxHeight = Math.max(120, Math.min(maxHeight, vh - top - pad))

  // Prefer growing toward the viewport center from the trigger.
  const anchorMidX = anchor.left + anchor.width / 2
  const onRightHalf = anchorMidX > vw / 2
  // Right-half trigger → align panel's right to trigger's right (grows left).
  // Left-half trigger → align panel's left to trigger's left (grows right).
  let left = onRightHalf ? anchor.right - width : anchor.left
  left = Math.min(Math.max(pad, left), vw - width - pad)

  return { top, left, width, maxHeight }
}
