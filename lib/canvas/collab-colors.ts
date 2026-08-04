/** Stable pastel colors for remote co-editors (Google Docs–style). */
const PALETTE = [
  '#E11D48', // rose
  '#2563EB', // blue
  '#059669', // emerald
  '#D97706', // amber
  '#7C3AED', // violet
  '#0891B2', // cyan
  '#C2410C', // orange
  '#4F46E5', // indigo
]

export function colorForUserKey(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0
  }
  return PALETTE[h % PALETTE.length]
}
