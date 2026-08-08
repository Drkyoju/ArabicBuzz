/**
 * Telegram capability cascade — absolute auto policy:
 * Fully automatic unless money/payment is required (no free path left).
 *
 * Flow: wake agents → research free (web/GitHub) → EXECUTE free via builtins
 * → deliver result on Telegram. Paid gate only after free exhausted.
 */

import {
  formatFreeExecuteNextAr,
  mapTaskToBuiltinFreeTools,
  type FreeExecuteHint,
} from '@/lib/agents/tools/free-execute-map'

/** Hard / unknown cues — escalate to agent pool + mandatory free research+execute. */
const CAPABILITY_GAP_CUE_RE =
  /(?:ما\s*عرف(?:ت|نا)?|ما\s*عرفت|لم\s*أعر[ف]|لا\s*أعرف|ما\s*حصلت|لم\s*أحص[ل]|لم\s*أجد|ما\s*لقيت|غير\s*مدعوم|لا\s*أستطيع|كيف\s*(?:أسو[يّ]|نسو[يّ]|أعمل|نعمل)|وش\s*(?:الأداة|المهارة|الـ?\s*mcp)|ابحث\s*(?:لي\s*)?(?:عن\s*)?(?:أداة|مهارة|mcp)|research\s*(?:tool|skill|mcp)|find\s*(?:a\s*)?(?:tool|skill|mcp)|no\s*tool|cannot\s*(?:complete|do)|unable\s*to)/iu

/**
 * When true: wake free room seats and instruct free-first research+execute.
 */
export function shouldEscalateCapabilityCascade(opts: {
  raw: string
  workKind: string
  preferFullAgent: boolean
  forceHeavy: boolean
}): boolean {
  if (!opts.preferFullAgent) return false
  if (CAPABILITY_GAP_CUE_RE.test(opts.raw)) return true
  if (
    opts.forceHeavy &&
    (opts.workKind === 'file' ||
      opts.workKind === 'mail' ||
      opts.workKind === 'question')
  ) {
    return true
  }
  return false
}

/** Builtin free tools for this task (if any) — for prompt injection. */
export function builtinFreeHintsForTask(task: string): FreeExecuteHint[] {
  return mapTaskToBuiltinFreeTools(task)
}

/** Prompt nudge: auto research → execute free → TG delivery. */
export function capabilityCascadePromptNudgeAr(task?: string): string {
  const hints = task ? mapTaskToBuiltinFreeTools(task) : []
  const builtinBlock = hints.length
    ? `\n${formatFreeExecuteNextAr(hints)}`
    : ''
  return [
    '[تشغيل تلقائي كامل — إلا بوابة الدفع]',
    '١) أيقظ مقاعد الغرفة المتفرّغة واطلب مساعدتها — لا تصمت ولا تسأل «هل تريد؟».',
    '٢) ابحث مجاناً أولاً عبر research_task_tools (ويب + GitHub).',
    '٣) إن وُجد حل مجاني / مكتبة مدمجة (pdf-lib، convert_document، arabic_ocr…): نفّذه فوراً وأعد الناتج بـ return_file — البوت يمرّره للمجموعة.',
    '٤) ممنوع تشغيل كود MCP بعيد غير موثوق؛ طبّق القدرة نفسها بالمكتبات المدمجة.',
    '٥) ممنوع طلب إعادة إرسال الملف إن وُجدت بايتات/خزنة/مهمة معلّقة/Drive بنفس الاسم — استأنف تلقائياً.',
    '٦) ملف كبير: خزّن → Drive/غرفة → عدّل → أعد لتيليجرام تلقائياً.',
    '٧) فقط إن فشل كل مسار مجاني واحتجت مفتاحاً/اشتراكاً مدفوعاً: انشر messageAr (بدائل مدفوعة الأرخص) وانتظر الموافقة/المفتاح.',
    'ممنوع ادّعاء النجاح دون تنفيذ.',
    builtinBlock,
  ]
    .filter(Boolean)
    .join(' ')
}

/** System rule block for Telegram agent. */
export const TELEGRAM_CAPABILITY_CASCADE_SYSTEM_AR = `تشغيل تلقائي مطلق (إلا بوابة الدفع):
- نفّذ فوراً بلا «هل تريد؟» وبلا طلب إعادة إرسال إن وُجدت بايتات/خزنة/مهمة معلّقة/Drive بالاسم.
- عجز/مهمة صعبة: أيقظ وكلاء الغرفة → research_task_tools (مجاني أولاً) → إن وُجدت أدوات مدمجة مجانية (pdf-lib / convert / OCR…) نفّذها فوراً وreturn_file للمجموعة.
- لا تشغّل كود MCP بعيداً غير موثوق؛ نفّذ القدرة نفسها بالمكتبات الموثوقة المدمجة.
- HITL فقط للحذف الحساس/RBAC أو عندما يلزم مفتاح/دفع بعد استنفاد المجاني.
- المهام الناقصة تُستأنف من الطابور تلقائياً. الملفات الكبيرة: غرفة/Drive ثم العودة لتيليجرام.
- فقط عند استنفاد المجاني: رسالة عربية ببدائل مدفوعة الأرخص وانتظر المفتاح/الموافقة. ممنوع الصمت. ممنوع ادّعاء النجاح دون فعل.`
