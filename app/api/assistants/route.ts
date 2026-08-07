import { NextRequest, NextResponse } from 'next/server'
import { listAssistantCatalog } from '@/lib/assistants/catalog'

export const dynamic = 'force-dynamic'

/** Public catalog of general-purpose Arabic assistants (نواة عامة). */
export async function GET(_req: NextRequest) {
  return NextResponse.json({
    titleAr: 'مساعد العمل — بريد · تقويم · تيليجرام',
    subtitleAr:
      'مساعدون تنفيذيون: اكتب النتيجة بالعربية → يستدعون Gmail والتقويم وتيليجرام والملفات → بطاقة بما نُفّذ فعلاً. قوالب الجمعية تبقى منفصلة في الغرف.',
    assistants: listAssistantCatalog(),
    telegramHintAr:
      'في مجموعة تيليجرام المربوطة: «كابتن اليوم» أو «صفر البريد» أو «ملخص يومي».',
  })
}
