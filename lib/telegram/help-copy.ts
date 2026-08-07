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
    '🤖 بوت Arabic Buzz — يقرأ كل شيء · يرد عند المنشن فقط',
    `الموقع: ${TELEGRAM_SITE_URL}`,
    '',
    '👁 بعد /link + إيقاف Group Privacy: كل رسالة تُحلَّل فوراً (نص · صوت · ملف)',
    '• طلب عملي (موعد / ملف / Drive / مهمة…) → يُنفَّذ فوراً حتى بدون منشن',
    '• دردشة عابرة → تحليل صامت — بدون سبام في القروب',
    `• رد ظاهر في القروب فقط عند منشن ${tag || 'البوت'} أو الرد عليه`,
    '• استثناء: إن ما عرف / ما حصل → جملة قصيرة «ما عرفت كذا» / «ما حصلت هذا»',
    '',
    'لماذا لا تُنسخ كل الرسائل لغرفة الموقع؟',
    'لأن ذلك يكرّر نفس النص مرتين (مقرف). نافذة «تيليجرام» في الموقع للمشاهدة الحية؛',
    'الوكيل يعمل في تيليجرام. الوسائط فقط تُستورد لأرشيف الغرفة / Drive.',
    '',
    'أمثلة:',
    '• موعد / اجتماع → تقويم الغرفة (توقيت السعودية)',
    '• مهمة / تذكير → لوحة مهام الغرفة',
    '• ملف / لائحة / حوّل / عدّل / OCR → خزنة + Drive إن مربوط',
    '• بريد / إيميل → بريد الجمعية أو Gmail المربوط',
    '• أرسل لأحمد: … · بلّغ المجموعة: …',
    `• ${tag || '@bot'} لخّص… — رد كامل ظاهر في القروب`,
    '',
    '🎤 صوت: تفريغ دائماً · ملخص/أزرار عند المنشن · تنفيذ صامت إن وُجد طلب',
    '📎 ملفات: تُحفظ وتُحلَّل فوراً — الناتج يظهر في القروب عند المنشن',
    '',
    'حدود صادقة:',
    '• Drive يحتاج ربط Google من الموقع',
    '• الحذف (ملفات الغرفة/Drive) بموافقة — البوت لا يحذف رسائل تيليجرام أبداً',
    '',
    'أوامر:',
    `${linkCmd} — ربط المجموعة بالغرفة`,
    '/help · /status · /rooms · /approve · /ping',
    '',
    'إعداد المجموعة (ضروري لرؤية كل الرسائل):',
    '1) أضف البوت كمشرف (رسائل + وسائط)',
    `2) ${linkCmd}`,
    '3) BotFather → Group Privacy → Disable',
    '4) اكتب طلباً عادياً للتنفيذ الصامت، أو منشن البوت لرد ظاهر',
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
