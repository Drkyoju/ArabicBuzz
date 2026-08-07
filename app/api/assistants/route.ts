import { NextRequest, NextResponse } from 'next/server'
import { listAssistantCatalog } from '@/lib/assistants/catalog'
import {
  assistantParallelHintAr,
  assistantParallelNoteAr,
  getAssistantMaxParallel,
} from '@/lib/assistants/parallel'

export const dynamic = 'force-dynamic'

/** Public catalog + queue limits (نواة عامة — composer-first). */
export async function GET(_req: NextRequest) {
  const maxParallel = getAssistantMaxParallel()
  return NextResponse.json({
    titleAr: 'مهام التشغيل',
    subtitleAr:
      'مهام تشغيل عامة للمساحة (بريد · تقويم · ملفات · تيليجرام) — ليست مساعداً خاصاً لكل موظف. غرفة الفريق = محادثة الفريق + الوكلاء بـ @؛ نفس الأدوات تقريباً بواجهتين.',
    howToAr:
      'اكتب طلبك واضغط إرسال. كل طلب مهمة في الطابور. إن أرسلت أكثر من واحدة يعملون معاً حتى الحد، والباقي بالانتظار حتى تفرغ خانة.',
    maxParallel,
    hintAr: assistantParallelHintAr(maxParallel),
    parallelNoteAr: assistantParallelNoteAr(maxParallel),
    assistants: listAssistantCatalog(),
    telegramHintAr:
      'في مجموعة تيليجرام المربوطة: اكتب الطلب طبيعياً (مثل «صفر البريد» أو «ملخص يومي»).',
  })
}
