/**
 * Map raw errors to helpful Arabic guidance for Telegram users.
 */
export function formatTelegramErrorAr(
  err: unknown,
  opts?: { inGroup?: boolean; botUsername?: string }
): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : 'حدث خطأ غير متوقع.'
  const lower = raw.toLowerCase()
  const tag = opts?.botUsername ? `@${opts.botUsername}` : 'البوت'

  if (
    /not linked|google|drive|googleapis|invalid_grant|token/i.test(lower) ||
    /درايف|google غير مربوط|غير مربوط/.test(raw)
  ) {
    return [
      '🔗 Google Drive غير مربوط لهذا المالك.',
      'من الموقع: الإعدادات → ربط Google، ثم أعد الطلب.',
      'يمكنني العمل على ملفات خزنة الغرفة المرفوعة هنا بدون Drive.',
      'الموقع: https://arabicbuzz-fooc9h.cranl.net/',
    ].join('\n')
  }

  if (/link|binding|غير مربوط|اربط المجموعة|no.*binding/i.test(lower + raw)) {
    return [
      '📎 هذه المجموعة غير مربوطة بغرفة Arabic Buzz.',
      `أرسل: /link${opts?.botUsername ? '@' + opts.botUsername : ''}`,
      'ثم عطّل Group Privacy من BotFather إن أردت رؤية كل الرسائل.',
    ].join('\n')
  }

  if (
    /403|forbidden|bot was blocked|chat not found|can't initiate|deactivated/i.test(
      lower
    )
  ) {
    return [
      '🚫 تعذّر الإرسال الخاص.',
      'السبب الأشيع: المستلم لم يضغط Start على البوت من قبل.',
      'الحل: اطلب منه فتح محادثة خاصة مع ' + tag + ' والضغط Start، أو بلّغ عبر المجموعة المربوطة.',
    ].join('\n')
  }

  if (/rate|429|too many/i.test(lower)) {
    return '⏳ الطلبات كثيرة الآن. انتظر ثوانٍ ثم أعد المحاولة.'
  }

  if (/timeout|etimedout|aborted|deadline/i.test(lower)) {
    return '⏱️ انتهت مهلة المعالجة. أعد الطلب بجملة أقصر أو قسّمه إلى خطوتين.'
  }

  if (/whisper|transcri|stt|تفريغ|صوت/i.test(lower + raw)) {
    return [
      '🎤 تعذّر تفريغ الصوت بوضوح.',
      'أعد التسجيل بصوت أوضح، أو اكتب النص مباشرة.',
    ].join('\n')
  }

  if (opts?.inGroup && /permission|can't send|not enough rights/i.test(lower)) {
    return [
      '👮 البوت لا يملك صلاحية الإرسال في المجموعة.',
      'اجعله مشرفاً واسمح بإرسال الرسائل والوسائط.',
    ].join('\n')
  }

  // Keep short useful raw detail
  const clipped = raw.replace(/\s+/g, ' ').trim().slice(0, 280)
  return `تعذّر الإكمال: ${clipped}\nإن استمر الخطأ: /status أو /help`
}
