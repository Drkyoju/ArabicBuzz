/**
 * Map provider / transport errors to short MSA for the agent workspace.
 * Keep raw English in server logs only — never paste into room posts.
 */

const ARABIC_SCRIPT = /[\u0600-\u06FF]/

export function mapChatErrorAr(
  raw: string | undefined | null,
  opts?: { httpStatus?: number; code?: string }
): string {
  const code = (opts?.code || '').trim().toUpperCase()
  if (code === 'AUTH_REQUIRED') {
    return 'سجّل الدخول للإرسال، ثم أعد المحاولة.'
  }

  const text = (raw || '').trim()
  if (!text) {
    if (opts?.httpStatus && opts.httpStatus >= 500) {
      return 'تعذّر الرد من الخادم — حاول بعد لحظات.'
    }
    if (opts?.httpStatus === 429) {
      return 'الطلب كثير حالياً — انتظر قليلاً ثم أعد المحاولة.'
    }
    if (opts?.httpStatus && opts.httpStatus >= 400) {
      return `تعذّر الرد (رمز ${opts.httpStatus}).`
    }
    return 'تعذّر الرد — حاول مرة أخرى.'
  }

  // Already Arabic (or mostly) — keep as-is, lightly trim.
  if (ARABIC_SCRIPT.test(text) && !/Unknown model|rate limit|ECONN|ETIMEDOUT/i.test(text)) {
    return text.length > 280 ? `${text.slice(0, 277)}…` : text
  }

  const lower = text.toLowerCase()

  if (/unknown model|model id|model_not_found|invalid model/i.test(text)) {
    return 'النموذج غير معروف أو غير مفعّل — اختر نموذجاً آخر من إعدادات الوكيل.'
  }
  if (
    /rate limit|too many requests|429|quota|resource_exhausted/i.test(lower)
  ) {
    return 'تجاوزنا حد الطلبات مؤقتاً — انتظر قليلاً ثم أعد المحاولة.'
  }
  if (
    /timeout|etimedout|aborted|deadline|timed out/i.test(lower) ||
    opts?.httpStatus === 504
  ) {
    return 'انتهت مهلة الرد — أعد الإرسال أو اختصر الطلب.'
  }
  if (
    /unauthorized|invalid.?api.?key|authentication|401|403|forbidden/i.test(
      lower
    )
  ) {
    return 'مفتاح النموذج غير صالح أو منتهٍ — راجع إعدادات المزود.'
  }
  if (/econnrefused|enotfound|network|fetch failed|502|503/i.test(lower)) {
    return 'تعذّر الاتصال بمزوّد الذكاء — تحقق من الشبكة أو أعد المحاولة.'
  }
  if (/context.?length|too long|maximum.*token|payload too large/i.test(lower)) {
    return 'الطلب طويل جداً للنموذج — اختصر الرسالة أو قلّل المرفقات.'
  }
  if (/content.?policy|safety|blocked|moderation/i.test(lower)) {
    return 'المزوّد رفض المحتوى لأسباب السلامة — أعد صياغة الطلب.'
  }

  // Generic: never dump English stack / provider noise into the feed.
  if (opts?.httpStatus && opts.httpStatus >= 400) {
    return `تعذّر الرد (رمز ${opts.httpStatus}).`
  }
  return 'تعذّر إكمال الرد — حاول مرة أخرى أو غيّر النموذج.'
}

export function unknownModelMessageAr(modelId: string): string {
  const id = (modelId || '').trim() || '؟'
  return `النموذج «${id}» غير معروف — اختر نموذجاً من قائمة الوكلاء.`
}
