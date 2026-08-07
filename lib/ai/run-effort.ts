/**
 * User-facing run power / effort for room chat and `/api/chat`.
 * Maps to tool step budget + sampling temperature (no separate provider effort API).
 * Legacy `MAX` / «أقصى» is remapped to HIGH (no longer selectable).
 */

export type RunEffort = 'LOW' | 'MEDIUM' | 'HIGH'

export const RUN_EFFORT_ORDER: RunEffort[] = ['LOW', 'MEDIUM', 'HIGH']

export const RUN_EFFORT_LABELS_AR: Record<RunEffort, string> = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
}

/** Short labels under power buttons. */
export const RUN_EFFORT_SHORT_AR: Record<RunEffort, string> = {
  LOW: 'أسرع · أقل أدوات',
  MEDIUM: 'توازن يومي',
  HIGH: 'أدق · أكثر خطوات',
}

export const RUN_EFFORT_HINTS_AR: Record<RunEffort, string> = {
  LOW: 'أسرع وأرخص رموزاً — خطوتان للأدوات وحرارة منخفضة؛ للإجابات القصيرة.',
  MEDIUM: 'توازن بين السرعة والجودة — ٥ خطوات للأدوات؛ للاستخدام اليومي.',
  HIGH: 'أعمق وأكثر تحققاً — ٨ خطوات للأدوات؛ للتحليل والمهام المركّبة.',
}

export type RunEffortParams = {
  maxSteps: number
  temperature: number
  systemHintAr: string
}

export function parseRunEffort(raw: unknown): RunEffort {
  const v = String(raw || '')
    .trim()
    .toUpperCase()
  if (v === 'LOW' || v === 'MEDIUM' || v === 'HIGH') return v
  // Legacy «أقصى» / MAX → عالية (no longer offered)
  if (v === 'MAX') return 'HIGH'
  return 'LOW'
}

export function effortToRunParams(effort: RunEffort): RunEffortParams {
  switch (effort) {
    case 'LOW':
      return {
        maxSteps: 2,
        temperature: 0.25,
        systemHintAr:
          'وضع القوة: منخفضة — أجب بإيجاز شديد، وتجنب الأدوات إلا عند الضرورة.',
      }
    case 'MEDIUM':
      return {
        maxSteps: 5,
        temperature: 0.45,
        systemHintAr:
          'وضع القوة: متوسطة — توازن بين الإيجاز والجودة؛ استخدم الأدوات عند الحاجة.',
      }
    case 'HIGH':
      return {
        maxSteps: 8,
        temperature: 0.55,
        systemHintAr:
          'وضع القوة: عالية — حلّل بعمق أكثر، وتحقق بالأدوات عند الحاجة.',
      }
  }
}
