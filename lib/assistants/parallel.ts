/**
 * Cap parallel assistant / room-agent workers per scope.
 * Netlify function concurrency is finite — 20 simultaneous is technically
 * possible via ASSISTANT_MAX_PARALLEL but burns quota and hits timeouts.
 * Default 8; env clamp 1–20.
 */

const DEFAULT_MAX = 8
const HARD_MIN = 1
const HARD_MAX = 20

/** Client-safe defaults (no env). Keep in sync with DEFAULT_MAX / HARD_MAX. */
export const ASSISTANT_PARALLEL_DEFAULT = DEFAULT_MAX
export const ASSISTANT_PARALLEL_HARD_MAX = HARD_MAX
/** Max agents in one team (@الجميع / تعاون) fan-out. */
export const ROOM_TEAM_RUN_CAP = HARD_MAX

export function getAssistantMaxParallel(): number {
  const raw = process.env.ASSISTANT_MAX_PARALLEL
  const n =
    raw != null && raw !== '' ? Number.parseInt(String(raw), 10) : DEFAULT_MAX
  if (!Number.isFinite(n)) return DEFAULT_MAX
  return Math.min(HARD_MAX, Math.max(HARD_MIN, n))
}

/** Room team fan-out uses the same Netlify-safe cap. */
export function getRoomAgentMaxParallel(): number {
  return getAssistantMaxParallel()
}

/** Public copy for UI / catalog. */
export function assistantParallelHintAr(
  max = getAssistantMaxParallel()
): string {
  return `حتى ${max} وكيل/مهمة معاً؛ الباقي بالانتظار.`
}

/** Honest Netlify note for assistants catalog. */
export function assistantParallelNoteAr(
  max = getAssistantMaxParallel()
): string {
  return `على Netlify يمكن تقنياً تشغيل حتى ${HARD_MAX} معاً عبر ASSISTANT_MAX_PARALLEL، لكن ذلك يضغط مهلة الدوال والحصة. الحد الحالي: ${max} متوازية والباقي ينتظر في الطابور.`
}
