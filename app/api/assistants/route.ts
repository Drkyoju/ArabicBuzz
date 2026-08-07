import { NextRequest, NextResponse } from 'next/server'
import { listAssistantCatalog } from '@/lib/assistants/catalog'

export const dynamic = 'force-dynamic'

/** Public catalog of general-purpose Arabic assistants (نواة عامة). */
export async function GET(_req: NextRequest) {
  return NextResponse.json({
    titleAr: 'المساعدون — نواة العمل',
    subtitleAr:
      'مساعدون جاهزون للعمل العام: اكتب النتيجة بالعربية → يُنفَّذ عبر الأدوات → بطاقة نتيجة قصيرة. قوالب الجمعية تبقى منفصلة في الغرف.',
    assistants: listAssistantCatalog(),
    telegramHintAr:
      'في مجموعة تيليجرام المربوطة يمكنك استدعاء نفس المساعدين بكلمات مثل «صفر البريد» أو «ملخص يومي».',
  })
}
