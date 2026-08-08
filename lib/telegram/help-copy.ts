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
    '🤖 بوت Arabic Buzz — أدوات غرفة الموقع في جيبك (ليس نسخة بصرية كاملة)',
    `الموقع: ${TELEGRAM_SITE_URL}`,
    '',
    '👁 بعد /link + إيقاف Group Privacy: يسمع كل شيء (نص · صوت · ملف)',
    '• طلب («أبغى كذا» / صوت / ملف) → يُنفَّذ فوراً ويرد بالناتج — بدون منشن',
    '• دردشة بين الناس → صامت (استيراد الوسائط فقط)',
    '• المنشن اختياري — للتأكيد فقط',
    '',
    'خاص (DM): تنفيذ كامل + رد حر — الصوت → فهم → تنفيذ فوري',
    '',
    'أمثلة:',
    '• إحاطة الصباح / ملخص اليوم → owner_morning_brief',
    '• ابحث في الغرفة عن … → room_search (بريد · ملفات · تقويم)',
    '• موعد / اجتماع → تقويم الغرفة (توقيت السعودية)',
    '• مهمة / تذكير → لوحة مهام الغرفة',
    '• جيب اللائحة / عدّل الملف / حوّل إلى Word / علّق على PDF → خزنة + Drive إن مربوط → مرفق هنا',
    '• بريد / إيميل → بريد الجمعية أو Gmail المربوط',
    '• ابحث في جوجل عن … → web_search',
    '• أرسل لأحمد: … · بلّغ المجموعة: …',
    '• يا وكيل١ لخّص… · أيقظ الوكيل',
    '',
    '🎤 صوت: تفريغ → إن كان طلباً للبوت يُنفَّذ فوراً؛ إن كان حديثاً بشرياً يُترَك',
    '📎 ملفات مع تعليق طلب: تنفيذ + مرفق ناتج. بدون تعليق في القروب: أرشفة فقط',
    '',
    'حدود صادقة:',
    '• ليس واجهة الموقع كاملة: لا سبورة ولا شريط TipTap ولا قلم PDF حرّ',
    '• Drive يحتاج ربط Google من الموقع',
    '• الحذف (ملفات الغرفة/Drive) بموافقة — البوت لا يحذف رسائل تيليجرام أبداً',
    '• PDF عربي: استبدال النص أدق عبر محرّك HarfBuzz؛ التعليق عبر pdf_annotate',
    '',
    'أوامر:',
    `${linkCmd} — ربط المجموعة بالغرفة`,
    '/help · /status · /rooms · /approve · /ping',
    '',
    'إعداد المجموعة:',
    '1) أضف البوت كمشرف (رسائل + وسائط)',
    `2) ${linkCmd}`,
    '3) BotFather → Group Privacy → Disable',
    '4) اكتب أو سجّل صوتاً مباشرة — بدون منشن',
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
