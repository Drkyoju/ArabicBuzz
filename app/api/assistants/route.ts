import { NextRequest, NextResponse } from 'next/server'
import { listAssistantCatalog } from '@/lib/assistants/catalog'
import {
  assistantParallelHintAr,
  getAssistantMaxParallel,
} from '@/lib/assistants/parallel'

export const dynamic = 'force-dynamic'

/** Public catalog + queue limits (نواة عامة — composer-first). */
export async function GET(_req: NextRequest) {
  const maxParallel = getAssistantMaxParallel()
  return NextResponse.json({
    titleAr: 'المساعدون',
    subtitleAr:
      'اكتب ما تريده بالعربية — نوجّه الطلب للمساعد المناسب (بريد · تقويم · ملفات · تيليجرام) وننفّذ. مهام متعددة تدخل الطابور.',
    howToAr:
      'اكتب طلبك في «وش تبي؟» واضغط إرسال. كل طلب مهمة في الطابور. إن أرسلت أكثر من واحدة يعملون معاً حتى الحد، والباقي بالانتظار حتى تفرغ خانة.',
    maxParallel,
    hintAr: assistantParallelHintAr(maxParallel),
    parallelNoteAr: `يمكن تقنياً تشغيل حتى 20 معاً، لكن ذلك يضغط مهلة Netlify والحصة. الحد الحالي: ${maxParallel} مهام متوازية والباقي ينتظر.`,
    assistants: listAssistantCatalog(),
    telegramHintAr:
      'في مجموعة تيليجرام المربوطة: اكتب الطلب طبيعياً (مثل «صفر البريد» أو «ملخص يومي»).',
  })
}
