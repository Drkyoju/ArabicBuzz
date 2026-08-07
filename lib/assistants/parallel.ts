/**
 * Cap parallel assistant workers per scope (Netlify free-tier safe).
 * 20 simultaneous is technically possible but burns quota and hits timeouts —
 * default 4; override with ASSISTANT_MAX_PARALLEL.
 */

const DEFAULT_MAX = 4
const HARD_MIN = 1
const HARD_MAX = 8

export function getAssistantMaxParallel(): number {
  const raw = process.env.ASSISTANT_MAX_PARALLEL
  const n = raw != null && raw !== '' ? Number.parseInt(String(raw), 10) : DEFAULT_MAX
  if (!Number.isFinite(n)) return DEFAULT_MAX
  return Math.min(HARD_MAX, Math.max(HARD_MIN, n))
}

/** Public copy for UI / catalog. */
export function assistantParallelHintAr(max = getAssistantMaxParallel()): string {
  return `حتى ${max} مهام معاً؛ الباقي بالانتظار.`
}
