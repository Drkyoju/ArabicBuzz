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
    '🤖 بوت Arabic Buzz — أقصى قوة: القروب المربوط = غرفة الموقع كاملة',
    `الموقع: ${TELEGRAM_SITE_URL}`,
    '',
    '📌 بعد الربط اكتب عادي (بدون /ask) — نفس وكلاء الغرفة:',
    '• موعد / اجتماع → تقويم الغرفة (توقيت السعودية Asia/Riyadh)',
    '• مهمة / تذكير → لوحة مهام الغرفة',
    '• ملف / لائحة / حوّل / عدّل / OCR → خزنة الغرفة + Drive إن مربوط',
    '• بريد / إيميل / صندوق الوارد → بريد الجمعية (للأعضاء) أو Gmail المربوط',
    '• أرسل لأحمد: … → خاص إن بدأ البوت، وإلا منشور في المجموعة',
    '• بلّغ المجموعة: … / نسّق مع سارة: … → تبليغ وتنسيق',
    '• سؤال / لخّص / ابحث / أبغا… → يوقظ وكيل١ ثم وكيل٢ عند الانشغال',
    '• يا وكيل١ … / @وكيل٢ / أبغا للجميع → توجيه صريح للمقاعد',
    '',
    '🎤 صوت: تفريغ عربي → ملخص القصد → أزرار (نفّذ · موعد · مهمة · ملف · بريد · تبليغ · أيقظ) + تنفيذ تلقائي',
    '📎 ملفات: Word / Excel / PDF / صور (+ OCR للممسوح) — الناتج يُعاد كمرفق',
    '✉️ بريد الجمعية: الأعضاء المسجّلون يستخدمونه من البوت والموقع (إعداد IMAP للمالك فقط)',
    '',
    'حدود صادقة:',
    '• Drive يحتاج ربط Google من الموقع',
    '• لا رسالة خاصة لمن لم يضغط Start على البوت',
    '• الحذف (ملفات الغرفة/Drive) فقط بموافقة بشرية — البوت لا يحذف رسائل تيليجرام أبداً',
    '',
    'أوامر:',
    `${linkCmd} — ربط المجموعة بالغرفة`,
    '/help · /status · /rooms · /approve · /ping',
    '',
    'إعداد المجموعة:',
    '1) أضف البوت كمشرف (رسائل + وسائط)',
    `2) ${linkCmd}`,
    '3) BotFather → Group Privacy → Disable',
    '4) اكتب طلبك بالعربية أو أرسل صوتاً',
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
