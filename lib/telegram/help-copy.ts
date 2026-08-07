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
    '🤖 بوت Arabic Buzz — القروب المربوط = غرفة الفريق على الموقع',
    `الموقع: ${TELEGRAM_SITE_URL}`,
    '',
    '📌 بعد الربط اكتب عادي (بدون /ask):',
    '• موعد / اجتماع → تقويم الغرفة (توقيت السعودية Asia/Riyadh)',
    '• مهمة / تذكير → لوحة مهام الغرفة',
    '• ملف / لائحة / حوّل / عدّل → خزنة الغرفة (+ Drive إن مربوط)',
    '• سؤال / لخّص / ابحث → يوقظ وكيل١ ثم وكيل٢ عند الانشغال',
    '• @وكيل١ أو «أيقظ الوكيل» → توجيه صريح للمقعد',
    '• أرسل لأحمد: … → خاص إن بدأ البوت، وإلا منشور في المجموعة',
    '• بلّغ المجموعة: … → تنبيه للجميع',
    '• نسّق مع سارة: … → تبليغ/تنسيق',
    '',
    '🎤 صوت: تفريغ عربي → ملخص القصد → أزرار + تنفيذ تلقائي عند وضوح القصد',
    '📎 ملفات: Word / Excel / PDF / صور (+ OCR للممسوح)',
    '✉️ بريد: إن رُبط Google أو صندوق البريد من الموقع',
    '',
    'حدود صادقة:',
    '• Drive يحتاج ربط Google من الموقع',
    '• لا رسالة خاصة لمن لم يضغط Start على البوت',
    '• الحذف فقط بموافقة بشرية (أزرار)',
    '',
    'أوامر:',
    `${linkCmd} — ربط المجموعة بالغرفة`,
    '/help · /status · /rooms · /approve · /ping',
    '',
    'إعداد المجموعة:',
    '1) أضف البوت كمشرف (رسائل + وسائط)',
    `2) ${linkCmd}`,
    '3) BotFather → Group Privacy → Disable',
    '4) اكتب طلبك بالعربية',
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
    opts.wakeHintAr || 'الوكيل: نص · صوت · ملفات — مثل غرفة الموقع (وكيل١→٢)',
    opts.googleHintAr || null,
    `الموقع: ${TELEGRAM_SITE_URL}`,
  ].filter((x): x is string => Boolean(x))
}

export const TELEGRAM_PING_OK_AR =
  '✅ البوت يعمل. اكتب طلبك بالعربية أو /help.'
