/**
 * Central Arabic copy for Telegram /help · /status · quick tips.
 * Kept free of Bot context so unit tests can assert coverage.
 */

export const TELEGRAM_SITE_URL = 'https://arabicbuzz-fooc9h.cranl.net/'

export function buildTelegramHelpAr(opts?: {
  botUsername?: string
}): string {
  const tag = opts?.botUsername ? `@${opts.botUsername}` : ''
  const linkCmd = tag ? `/link${tag}` : '/link'
  return [
    '🤖 بوت Arabic Buzz — الموقع كاملاً في جيبك',
    `الموقع: ${TELEGRAM_SITE_URL}`,
    '',
    '👁 بعد /link + إيقاف Group Privacy: كل رسالة تُحلَّل فوراً (نص · صوت · ملف)',
    '• طلب عملي (موعد / ملف / Drive / مهمة / بحث…) → يُنفَّذ فوراً حتى بدون منشن',
    '• طلب ملف / تعديل / حذف → يُنفَّذ ويُرسل الناتج أو أزرار الموافقة في القروب',
    '• دردشة عابرة → تحليل صامت — بدون سبام نصي',
    `• رد نصي ظاهر فقط عند منشن ${tag || 'البوت'} أو الرد عليه أو «ما عرفت/ما حصلت»`,
    '',
    'خاص (DM): تنفيذ كامل + رد حر — الصوت → فهم → تنفيذ فوري',
    '',
    'أمثلة:',
    '• موعد / اجتماع → تقويم الغرفة (توقيت السعودية)',
    '• مهمة / تذكير → لوحة مهام الغرفة',
    '• جيب اللائحة / عدّل الملف / حوّل إلى Word → خزنة + Drive إن مربوط → مرفق هنا',
    '• بريد / إيميل → بريد الجمعية أو Gmail المربوط',
    '• ابحث في جوجل عن … → web_search',
    '• أرسل لأحمد: … · بلّغ المجموعة: …',
    '• يا وكيل١ لخّص… · أيقظ الوكيل',
    `• ${tag || '@bot'} لخّص… — رد كامل ظاهر في القروب`,
    '',
    '🎤 صوت: تفريغ → تنفيذ فوري (أزرار توجيه اختيارية عند المنشن/الخاص)',
    '📎 ملفات وصور: تُحفظ وتُحلَّل؛ الناتج يُرسل كمرفق عند الطلب',
    '',
    'حدود صادقة:',
    '• Drive يحتاج ربط Google من الموقع',
    '• الحذف (ملفات الغرفة/Drive) بموافقة — البوت لا يحذف رسائل تيليجرام أبداً',
    '• PDF عربي: استبدال النص أدق عبر محرّك HarfBuzz؛ إعادة البناء محدودة',
    '',
    'أوامر:',
    `${linkCmd} — ربط المجموعة بالغرفة`,
    '/help · /status · /rooms · /approve · /ping',
    '',
    'إعداد المجموعة (ضروري لرؤية كل الرسائل):',
    '1) أضف البوت كمشرف (رسائل + وسائط)',
    `2) ${linkCmd}`,
    '3) BotFather → Group Privacy → Disable',
    '4) اكتب طلباً عادياً للتنفيذ، أو منشن البوت لرد نصي كامل',
  ].join('\n')
}

export function buildTelegramStatusLinesAr(opts: {
  chatId: string
  inGroup: boolean
  scopeNameAr: string
  scopeId: string
  pendingCount: number
  googleHintAr?: string | null
  wakeHintAr?: string
}): string[] {
  return [
    'حالة Arabic Buzz عبر تيليجرام:',
    `المحادثة: ${opts.chatId}${opts.inGroup ? ' (مجموعة مربوطة)' : ' (خاص)'}`,
    `المساحة: ${opts.scopeNameAr} (${opts.scopeId})`,
    `موافقات معلّقة: ${opts.pendingCount}`,
    opts.wakeHintAr ||
      'الوكيل: نص · صوت · ملفات · بريد · تبليغ — أقصى قوة مثل غرفة الموقع (وكيل١→٢)',
    opts.googleHintAr || null,
    `الموقع: ${TELEGRAM_SITE_URL}`,
  ].filter((x): x is string => Boolean(x))
}

export const TELEGRAM_PING_OK_AR =
  '✅ البوت يعمل بأقصى قوة. اكتب طلبك بالعربية أو /help.'
