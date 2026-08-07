/**
 * User-facing run power / effort for room chat and `/api/chat`.
 * Maps to tool step budget + sampling temperature (no separate provider effort API).
 */

export type RunEffort = 'LOW' | 'MEDIUM' | 'HIGH' | 'MAX'

export const RUN_EFFORT_ORDER: RunEffort[] = ['LOW', 'MEDIUM', 'HIGH', 'MAX']

export const RUN_EFFORT_LABELS_AR: Record<RunEffort, string> = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
  MAX: 'أقصى',
}

export const RUN_EFFORT_HINTS_AR: Record<RunEffort, string> = {
  LOW: 'ردود سريعة بخطوات أدوات أقل.',
  MEDIUM: 'التوازن اليومي — جودة معقولة.',
  HIGH: 'تحليل أعمق وخطوات أدوات أكثر.',
  MAX: 'أقصى جهد للمسائل المعقدة (أبطأ).',
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
  if (v === 'LOW' || v === 'MEDIUM' || v === 'HIGH' || v === 'MAX') return v
  return 'MEDIUM'
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
    case 'MAX':
      return {
        maxSteps: 10,
        temperature: 0.65,
        systemHintAr:
          'وضع القوة: أقصى — ابذل أقصى جهد معقول ضمن حدود الوقت؛ استخدم الأدوات اللازمة.',
      }
  }
}
