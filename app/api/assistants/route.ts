import { NextRequest, NextResponse } from 'next/server'
import { listAssistantCatalog } from '@/lib/assistants/catalog'
import {
  assistantParallelHintAr,
  assistantParallelNoteAr,
  getAssistantMaxParallel,
  getAssistantMaxPerUser,
} from '@/lib/assistants/parallel'

export const dynamic = 'force-dynamic'

/** Public catalog + queue limits (نواة عامة — composer-first). */
export async function GET(_req: NextRequest) {
  const maxParallel = getAssistantMaxParallel()
  const maxPerUser = getAssistantMaxPerUser()
  return NextResponse.json({
    titleAr: 'مهام التشغيل',
    subtitleAr:
      'مهام تشغيل عامة للمساحة (بريد · تقويم · ملفات · تيليجرام) — ليست مساعداً خاصاً لكل موظف. غرفة الفريق = محادثة الفريق + الوكلاء بـ @؛ نفس الأدوات تقريباً بواجهتين.',
    howToAr:
      'اختر النموذج (Gemini / GLM / AgentRouter) والقوة من منخفضة إلى أقصى، ثم اكتب طلبك. كل مهمة تظهر كورقة صغيرة؛ حتى الحد لكل موظف يعملون معاً والباقي بالانتظار.',
    maxParallel,
    maxPerUser,
    hintAr: assistantParallelHintAr(maxPerUser),
    parallelNoteAr: assistantParallelNoteAr(maxParallel, maxPerUser),
    assistants: listAssistantCatalog(),
    telegramHintAr:
      'في مجموعة تيليجرام المربوطة: اكتب الطلب طبيعياً (مثل «صفر البريد» أو «ملخص يومي»).',
  })
}
