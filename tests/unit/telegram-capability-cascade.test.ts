import { describe, expect, it } from 'vitest'
import {
  shouldEscalateCapabilityCascade,
  capabilityCascadePromptNudgeAr,
  TELEGRAM_CAPABILITY_CASCADE_SYSTEM_AR,
} from '@/lib/telegram/capability-cascade'

describe('capability cascade', () => {
  it('escalates on ما عرفت / hard file', () => {
    expect(
      shouldEscalateCapabilityCascade({
        raw: 'ما عرفت أسوي كذا',
        workKind: 'question',
        preferFullAgent: true,
        forceHeavy: false,
      })
    ).toBe(true)

    expect(
      shouldEscalateCapabilityCascade({
        raw: 'حوّل هذا الملف',
        workKind: 'file',
        preferFullAgent: true,
        forceHeavy: true,
      })
    ).toBe(true)
  })

  it('nudge requires free execute then paid gate only', () => {
    const n = capabilityCascadePromptNudgeAr('كرر صفحة 48 بعد 45')
    expect(n).toContain('research_task_tools')
    expect(n).toContain('pdf_duplicate_page')
    expect(n).toContain('بوابة الدفع')
    expect(n).toMatch(/قاعدة ذهبية|مرفق جديد/)
    expect(TELEGRAM_CAPABILITY_CASCADE_SYSTEM_AR).toContain('تشغيل تلقائي مطلق')
    expect(TELEGRAM_CAPABILITY_CASCADE_SYSTEM_AR).toMatch(/قاعدة ذهبية/)
  })
})
