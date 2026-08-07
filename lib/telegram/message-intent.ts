/**
 * Parse Arabic «أرسل لفلان» / group notify / coordination messaging intents.
 */
export type TelegramMessageIntent =
  | {
      kind: 'dm'
      targetNameAr: string
      bodyAr: string
      labelAr: string
    }
  | {
      kind: 'broadcast'
      bodyAr: string
      labelAr: string
    }
  | null

/** Single name token (optionally @user). */
const NAME =
  '[@\\u0600-\\u06FFa-zA-Z0-9_\\-]{2,40}'

/** أرسل لأحمد: … · بلّغ سارة أن … · قل لمحمد … */
const DM_RE = new RegExp(
  `(?:^|[\\s\\n])(?:أرسل|ارسل|أرسلي|ارسلي|بل[ّ]?غ|بلّغي|بلغ|بلغي|قل|قولي|اكتب|اكتبي)\\s+(?:ل(?:ـ)?|إلى|الى)\\s*(${NAME})\\s*(?:[:：\\-–،,]|رسالة\\s*(?:تقول|مفادها)?|يقول|ييقول|ان|أن|إن)\\s*([\\s\\S]+)$`,
  'iu'
)

/** Soft DM without colon: أرسل لأحمد الاجتماع غداً */
const DM_SOFT_RE = new RegExp(
  `(?:^|[\\s\\n])(?:أرسل|ارسل|بل[ّ]?غ|بلغ|قل)\\s+(?:ل(?:ـ)?|إلى|الى)\\s*(${NAME})\\s+([\\s\\S]{3,})$`,
  'iu'
)

/** أرسل للمجموعة / بلّغ المجموعة / للفريق: … */
const BROADCAST_RE =
  /(?:^|[\s\n])(?:أرسل|ارسل|بل[ّ]?غ|بلغ|انشر|أعلن)\s+(?:ل(?:ـ)?(?:ل)?(?:مجموعة|قروب|فريق|أعضاء|اعضاء|الجميع|الجماعه|الجماعة)|للمجموعة|للقروب|للفريق|للأعضاء|للاعضاء|للجميع|(?:ال)?مجموعة|(?:ال)?قروب|(?:ال)?فريق|(?:ال)?أعضاء|(?:ال)?اعضاء|(?:ال)?جميع)\s*(?:[:：\-–،,])?\s*([\s\S]+)$/iu

/** رسالة لفلان: … */
const MSG_TO_RE = new RegExp(
  `(?:^|[\\s\\n])(?:رسالة|رساله)\\s+(?:ل(?:ـ)?|إلى|الى)\\s*(${NAME})\\s*[:：\\-–،,]\\s*([\\s\\S]+)$`,
  'iu'
)

/** رسالة لفلان نص… */
const MSG_TO_SOFT_RE = new RegExp(
  `(?:^|[\\s\\n])(?:رسالة|رساله)\\s+(?:ل(?:ـ)?|إلى|الى)\\s*(${NAME})\\s+([\\s\\S]{2,})$`,
  'iu'
)

/** نسّق مع فلان: … */
const COORD_RE = new RegExp(
  `(?:^|[\\s\\n])(?:نس[ّ]?ق|نسقي)\\s+مع\\s+(${NAME})\\s*[:：\\-–،,]\\s*([\\s\\S]+)$`,
  'iu'
)

const COORD_SOFT_RE = new RegExp(
  `(?:^|[\\s\\n])(?:نس[ّ]?ق|نسقي)\\s+مع\\s+(${NAME})\\s+([\\s\\S]{3,})$`,
  'iu'
)

function cleanTarget(raw: string): string {
  return raw
    .trim()
    .replace(/^[@ـ]+/, '')
    .replace(/[ـ]+/g, '')
    .replace(/[؟?!.]+$/g, '')
    .trim()
}

function fromMatch(
  m: RegExpMatchArray | null,
  labelAr: string
): TelegramMessageIntent {
  if (!m?.[1] || !m?.[2]?.trim()) return null
  const target = cleanTarget(m[1])
  const body = m[2].trim()
  if (target.length < 2 || body.length < 1) return null
  return { kind: 'dm', targetNameAr: target, bodyAr: body, labelAr }
}

export function parseTelegramMessageIntent(raw: string): TelegramMessageIntent {
  const t = (raw || '').trim()
  if (!t || t.length < 6) return null

  const broadcast = t.match(BROADCAST_RE)
  if (broadcast?.[1]?.trim()) {
    return {
      kind: 'broadcast',
      bodyAr: broadcast[1].trim(),
      labelAr: 'تنبيه مجموعة',
    }
  }

  return (
    fromMatch(t.match(DM_RE), 'رسالة لشخص') ||
    fromMatch(t.match(MSG_TO_RE), 'رسالة لشخص') ||
    fromMatch(t.match(COORD_RE), 'تنسيق / تبليغ') ||
    fromMatch(t.match(DM_SOFT_RE), 'رسالة لشخص') ||
    fromMatch(t.match(MSG_TO_SOFT_RE), 'رسالة لشخص') ||
    fromMatch(t.match(COORD_SOFT_RE), 'تنسيق / تبليغ')
  )
}

/** Heuristic: looks like a messaging / notify ask (for work-intent classifier). */
export function looksLikeTelegramMessaging(raw: string): boolean {
  if (parseTelegramMessageIntent(raw)) return true
  const t = (raw || '').trim()
  return /(?:أرسل|ارسل|بل[ّ]?غ|بلغ|رسالة\s+ل|نس[ّ]?ق\s+مع)\s+(?:ل|إلى|الى|مع|(?:ال)?مجموعة|(?:ال)?قروب|(?:ال)?فريق|(?:ال)?أعضاء|للمجموعة|للقروب|للفريق|للأعضاء|للجميع)/iu.test(
    t
  )
}
