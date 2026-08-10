/**
 * Pure short-intent parsing for @alhuda14bot.
 * Goal: execute Arabic shortcuts immediately with terse nudges — no over-explaining.
 * Hermes WhatsApp stays separate (no WA coupling here).
 *
 * Golden rule: brand-new TG attachment in the message = working copy → edit/summarize/
 * convert → return_file. Never require Drive/room/history.
 */

import {
  looksLikeDumbFileRefusalAr,
  TELEGRAM_FILE_GOLDEN_RULE_AR,
} from '@/lib/files/file-source-policy'

export type TelegramShortIntentKind =
  | 'web_search'
  | 'maps'
  | 'brief'
  | 'room_search'
  | 'mesh'
  | 'archive'
  | 'create_file'
  | 'edit_file'
  | 'mail'
  | 'calendar_book'
  | 'calendar_list'
  | 'task'
  | 'wiki'
  | 'math'
  | 'youtube'
  | 'ocr'
  | 'notify'
  | null

export type TelegramShortIntent = {
  kind: NonNullable<TelegramShortIntentKind>
  /** Payload for tools (query / place / subject). */
  payload: string
  labelAr: string
  /** Terse MSA nudge injected into the agent prompt. */
  nudgeAr: string
  forceHeavy: boolean
}

function clip(s: string, n = 240): string {
  const t = s.trim().replace(/\s+/g, ' ')
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

function stripLead(raw: string, re: RegExp): string {
  return raw.replace(re, '').trim().replace(/^[:：\-–،,\s]+/, '').trim()
}

/** Agent replies that are dumb clarifying asks — compress / reject in groups. */
const DUMB_CLARIFY_RE =
  /(?:هل\s*(?:تريد|تود|تحب|يمكنني|أقدر)|ماذا\s*(?:تريد|تقصد|تعني)|وض[ّ]?ح(?:\s*(?:لي|أكثر|اكثر))?|اشرح(?:\s*(?:أكثر|اكثر|المطلوب))?|أحتاج\s*(?:مزيد|تفاصيل|توضيح)|من\s*فضلك\s*(?:وض[ّ]?ح|اشرح)|قل\s*لي\s*(?:بالضبط|أكثر|اكثر)|ما\s*(?:هو\s*)?(?:المطلوب|القصد)\s*بالضبط|هل\s*تقصد|هل\s*يمكنني\s*(?:المساعدة|مساعدتك)|كيف\s*(?:يمكنني|أقدر)\s*مساعد)/iu

/** Overlong lecture-y openings the bot should not ship for shortcuts. */
const VERBOSE_PREAMBLE_RE =
  /^(?:بالتأكيد|طبعاً|طبعا|حسناً|حسنا|أكيد|سعيدة?\s*بالمساعدة|يسعدني|يمكنني\s*(?:المساعدة|مساعدتك)|سأقوم|سوف\s*(?:أقوم|أساعد))[!.،,\s]*/iu

export function looksLikeDumbClarifyAsk(text: string): boolean {
  const t = String(text || '').trim()
  if (!t || t.length > 900) return false
  if (looksLikeDumbFileRefusalAr(t)) return true
  // Successful tool-ish replies are never "dumb clarify"
  if (
    /(?:تم\s*(?:ال|)|أُنشئ|أنشأت|أضفت|وجدت|الإحداثي|osm|maps\.google|webViewLink|مرفق|return_file)/iu.test(
      t
    )
  ) {
    return false
  }
  return DUMB_CLARIFY_RE.test(t)
}

/**
 * Compress agent text for Telegram: drop verbose preambles; replace dumb asks.
 * Keeps successful result lines intact.
 */
export function compressTelegramReplyAr(raw: string): string {
  let t = String(raw || '').trim()
  if (!t) return t
  if (looksLikeDumbFileRefusalAr(t)) {
    return 'المرفق في الرسالة = نسخة العمل — نفّذ وأرجع الناتج بـ return_file. لا تشترط Drive.'
  }
  if (looksLikeDumbClarifyAsk(t)) {
    return 'نفّذ الطلب مباشرة إن أمكن — أعد صياغة مختصرة إن نقص عنصر واحد فقط (عنوان/وقت/اسم ملف).'
  }
  t = t.replace(VERBOSE_PREAMBLE_RE, '')
  // Drop trailing «هل تريد المزيد؟» style
  t = t
    .replace(
      /\n*(?:هل\s*(?:تريد|تود|تحب).{0,40}(?:\?|؟)?\s*$)/iu,
      ''
    )
    .trim()
  return t.slice(0, 3900)
}

const WEB_RE =
  /^(?:ابحث|دور|بحث)\s*(?:لي\s*)?(?:في|عبر|على)?\s*(?:ال)?(?:جوجل|google|ويب|انترنت|الإنترنت|duckduckgo)\s*(?:عن|على)?\s*(.+)$/iu
const WEB_SOFT_RE =
  /^(?:جوجل|google)\s*[:：]?\s*(.+)$/iu

const MAPS_RE =
  /^(?:أين|وين)\s*(?:تقع|موقع)?\s*(.+)$/iu
const MAPS_MAP_RE =
  /^(?:خريط[ةه]|موقع|إحداثي(?:ات)?|geocode)\s*(?:ل|عن|على)?\s*(.+)$/iu
const MAPS_SEND_RE =
  /^(?:أرسل|ارسل|أعطني|عطني|ور[ّ]?يني)\s*(?:موقع|خريط[ةه])\s*(?:ل|عن)?\s*(.+)$/iu

const BRIEF_RE =
  /^(?:إحاطة|احاطة)(?:\s*(?:ال)?(?:صباح|يوم|اليوم))?[\s!.؟?…]*$|^(?:ملخص|تقرير)\s*(?:ال)?(?:صباح|يوم|اليوم)[\s!.؟?…]*$|^(?:morning\s*brief)[\s!.؟?…]*$/iu

const ROOM_SEARCH_RE =
  /^(?:ابحث|دور)\s*(?:لي\s*)?(?:في|عبر)?\s*(?:ال)?(?:غرفة|موقع|جمعية|كل\s*شيء)\s*(?:عن|على)?\s*(.+)$/iu

const MESH_RE =
  /^(?:دور|ابحث)\s*(?:لي\s*)?(?:في\s*)?(?:ال)?شبكة\s*(?:عن|على)?\s*(.+)$/iu
const MESH_WHERE_RE =
  /^(?:وين|أين)\s*(?:ال)?(?:ملف|لائح|مستند|عقد)(?:\s*(?:عن|ل|باسم))?\s*(.*)$/iu

const ARCHIVE_RE =
  /^(?:أرشف|ارشف|أرشفة|ارشفة)\s*(?:ال)?(?:مجموعة|قروب|شات)?[\s!.؟?…]*$/iu

const CREATE_RE =
  /^(?:أنشئ|انشئ|اكتب|سو[يّ]|جه[ّ]?ز|حض[ّ]?ر)\s*(?:لي\s*)?(?:ملف|مستند|وثيق|مذكرة|ملاحظة|نص|ورد|وورد|word|pdf|docx)\s*(.*)$/iu
const CREATE_NEW_RE =
  /^(?:ملف|مستند)\s*جديد\s*(.*)$/iu

const EDIT_RE =
  /^(?:عد[ّ]?ل|حو[ّ]?ل)\s*(?:ال)?(?:ملف|مستند|مرفق|pdf|ورد|وورد|word|لائح|عقد)?\s*(.*)$/iu
const SUMMARIZE_FILE_RE =
  /^(?:لخ[ّ]?ص)\s*(?:ال)?(?:ملف|مستند|مرفق|pdf)\s*(.*)$/iu

const MAIL_RE =
  /^(?:ابحث|دور)\s*(?:لي\s*)?(?:في\s*)?(?:ال)?(?:بريد|إيميل|ايميل|gmail|inbox)\s*(?:عن|على)?\s*(.*)$/iu
const MAIL_SOFT_RE =
  /^(?:شو|وش|ماذا)\s*(?:في|عندنا\s*في)?\s*(?:ال)?(?:بريد|وارد|صندوق)[\s!.؟?…]*$/iu
const MAIL_SEND_RE =
  /^(?:أرسل|ارسل)\s*(?:بريد|إيميل|ايميل)\s*(?:إلى|ل|الى)?\s*(.+)$/iu

const CAL_BOOK_RE =
  /^(?:احجز|احجزي|أضف|اضف|سج[ّل])\s*(?:لي\s*)?(?:موعد|اجتماع|لقاء)\s*(.*)$/iu
const CAL_LIST_RE =
  /^(?:كم|عدد)\s*(?:ال)?(?:موعد|مواعيد)|(?:مواعيد|أجندة|اجندة)\s*(?:اليوم|الغرفة)?[\s!.؟?…]*$|^(?:وش|شو|ماذا)\s*(?:عندنا|فيه)\s*(?:اليوم|الليلة)[\s!.؟?…]*$/iu

const TASK_RE =
  /^(?:أضف|اضف|سج[ّل]|أنشئ|انشئ)\s*(?:لي\s*)?(?:مهم[ةه]|تاسك)\s*(.*)$/iu

const WIKI_RE =
  /^(?:ويكيبيديا|wikipedia)\s*(?:عن)?\s*(.+)$/iu

const MATH_RE =
  /^(?:احسب|حساب|math)\s*[:：]?\s*(.+)$/iu

const YT_RE =
  /^(?:لخ[ّ]?ص|تفريغ)\s*(?:ال)?(?:يوتيوب|youtube)\s*(.+)$/iu

const OCR_RE =
  /^(?:OCR|ocr|امسح\s*ضوئي|قراءة\s*مسح)[\s!.؟?…]*$/iu

const NOTIFY_RE =
  /^(?:أرسل|ارسل|بل[ّ]?غ|بلغ)\s+(?:ل(?:ـ)?|إلى|الى)\s*.+/iu

function nudgeFor(
  kind: NonNullable<TelegramShortIntentKind>,
  payload: string
): { labelAr: string; nudgeAr: string; forceHeavy: boolean } {
  const p = clip(payload || '—', 160)
  switch (kind) {
    case 'web_search':
      return {
        labelAr: 'بحث ويب',
        forceHeavy: false,
        nudgeAr: `[اختصار: بحث ويب] نفّذ web_search فوراً عن «${p}». أعد 3–5 نتائج مختصرة بروابط. ممنوع room_search. ممنوع سؤال توضيحي.`,
      }
    case 'maps':
      return {
        labelAr: 'موقع / خريطة',
        forceHeavy: false,
        nudgeAr: `[اختصار: خريطة] نفّذ geocode فوراً لـ «${p}» ثم انشر الاسم · الإحداثيات · osmUrl و googleMapsUrl. رد سطرين كحد أقصى.`,
      }
    case 'brief':
      return {
        labelAr: 'إحاطة صباح',
        forceHeavy: false,
        nudgeAr:
          '[اختصار: إحاطة] نفّذ owner_morning_brief فوراً. رد موجز بالعربية — بلا مقدمة طويلة.',
      }
    case 'room_search':
      return {
        labelAr: 'بحث غرفة',
        forceHeavy: true,
        nudgeAr: `[اختصار: بحث غرفة] نفّذ room_search عن «${p}» فوراً. لخّص النتائج سطوراً — بلا محاضرة.`,
      }
    case 'mesh':
      return {
        labelAr: 'شبكة تخزين',
        forceHeavy: true,
        nudgeAr: `[اختصار: شبكة] find_storage_mesh عن «${p}» بالترتيب Drive→تيليجرام→غرفة→ماك. ممنوع «أعد الإرسال». ثم نفّذ/أرجع الملف.`,
      }
    case 'archive':
      return {
        labelAr: 'أرشفة مجموعة',
        forceHeavy: true,
        nudgeAr:
          '[اختصار: أرشفة] نفّذ archive_telegram_group فوراً. أكّد سطراً واحداً بالنتيجة.',
      }
    case 'create_file':
      return {
        labelAr: 'إنشاء ملف',
        forceHeavy: true,
        nudgeAr: `[اختصار: إنشاء ملف] أنشئ فوراً عبر write_file أو pdf_create أو brain_create_document («${p}») ثم return_file. ملف جديد من الصفر لا يحتاج Drive ولا غرفة. ممنوع سؤال توضيحي إن المحتوى واضح.`,
      }
    case 'edit_file':
      return {
        labelAr: 'تعديل ملف',
        forceHeavy: true,
        nudgeAr: `[اختصار: تعديل/تلخيص/تحويل مرفق] ${TELEGRAM_FILE_GOLDEN_RULE_AR} المرفق في هذه الرسالة أو الأخير («${p}») = نسخة العمل حتى لو أول مرة. عدّل/لخّص/حوّل ثم return_file. ممنوع اشتراط Drive/غرفة أو «أعد الإرسال».`,
      }
    case 'mail':
      return {
        labelAr: 'بريد',
        forceHeavy: true,
        nudgeAr: `[اختصار: بريد] نفّذ mail_search/mail_read (أو gmail_*) عن «${p}» فوراً. لخّص مرسل·موضوع·مقتطف — لا تختلق.`,
      }
    case 'calendar_book':
      return {
        labelAr: 'حجز موعد',
        forceHeavy: false,
        nudgeAr: `[اختصار: موعد] room_calendar_create فوراً («${p}»، Asia/Riyadh). إن نقص الوقت افترض أقرب يوم عمل واذكر الافتراض. أكّد العنوان·الوقت. ممنوع «هل تود؟».`,
      }
    case 'calendar_list':
      return {
        labelAr: 'مواعيد',
        forceHeavy: false,
        nudgeAr:
          '[اختصار: مواعيد] room_calendar_list (اليوم إن ذُكر) بتوقيت السعودية. رد موجز بقائمة.',
      }
    case 'task':
      return {
        labelAr: 'مهمة',
        forceHeavy: false,
        nudgeAr: `[اختصار: مهمة] room_tasks_create فوراً («${p}»). سطر تأكيد واحد.`,
      }
    case 'wiki':
      return {
        labelAr: 'ويكيبيديا',
        forceHeavy: false,
        nudgeAr: `[اختصار: ويكيبيديا] wikipedia_lookup عن «${p}». ملخص قصير + رابط.`,
      }
    case 'math':
      return {
        labelAr: 'حساب',
        forceHeavy: false,
        nudgeAr: `[اختصار: حساب] math_eval لـ «${p}». أظهر الناتج فقط مع سطر قصير.`,
      }
    case 'youtube':
      return {
        labelAr: 'يوتيوب',
        forceHeavy: false,
        nudgeAr: `[اختصار: يوتيوب] youtube_transcript لـ «${p}» ثم لخّص النقاط — بلا محاضرة.`,
      }
    case 'ocr':
      return {
        labelAr: 'OCR',
        forceHeavy: true,
        nudgeAr: `[اختصار: OCR] ${TELEGRAM_FILE_GOLDEN_RULE_AR} arabic_ocr على مرفق تيليجرام في الرسالة/الأخير ثم أعد النص/الملف عبر return_file.`,
      }
    case 'notify':
      return {
        labelAr: 'تبليغ',
        forceHeavy: false,
        nudgeAr:
          '[اختصار: تبليغ] نفّذ notify_room_member فوراً من نص الرسالة. رد موجز بمسار التسليم.',
      }
  }
}

/**
 * Parse a short Arabic Telegram ask into a structured intent.
 * Returns null when the line is too vague / social / long for shortcut mode.
 */
export function parseTelegramShortIntent(raw: string): TelegramShortIntent | null {
  const t = (raw || '').trim()
  if (!t || t.length < 2) return null
  // Long free-form stays with full agent (still nudged via work kind).
  if (t.length > 220) return null
  if (/^\/[a-z_]+/i.test(t)) return null

  const tryMatch = (
    kind: NonNullable<TelegramShortIntentKind>,
    payload: string
  ): TelegramShortIntent => {
    const meta = nudgeFor(kind, payload)
    return {
      kind,
      payload: clip(payload, 280),
      labelAr: meta.labelAr,
      nudgeAr: meta.nudgeAr,
      forceHeavy: meta.forceHeavy,
    }
  }

  if (BRIEF_RE.test(t)) return tryMatch('brief', 'إحاطة الصباح')
  if (ARCHIVE_RE.test(t)) return tryMatch('archive', 'أرشف المجموعة')
  if (OCR_RE.test(t)) return tryMatch('ocr', 'OCR')
  if (CAL_LIST_RE.test(t)) return tryMatch('calendar_list', t)

  let m: RegExpMatchArray | null
  if ((m = t.match(ROOM_SEARCH_RE))) {
    const q = clip(m[1] || '')
    if (q.length >= 2) return tryMatch('room_search', q)
  }
  // Mesh before web — «الشبكة» = storage mesh, not DuckDuckGo.
  if ((m = t.match(MESH_RE)) || (m = t.match(MESH_WHERE_RE))) {
    const q = clip(m[1] || 'الملف')
    return tryMatch('mesh', q || 'الملف')
  }
  if ((m = t.match(WEB_RE)) || (m = t.match(WEB_SOFT_RE))) {
    const q = clip(m[1] || '')
    if (q.length >= 2) return tryMatch('web_search', q)
  }
  if (
    (m = t.match(MAPS_RE)) ||
    (m = t.match(MAPS_MAP_RE)) ||
    (m = t.match(MAPS_SEND_RE))
  ) {
    const q = clip(m[1] || '')
    if (q.length >= 2 && !/^(?:الملف|اللائح|المستند|الموعد)/i.test(q)) {
      return tryMatch('maps', q)
    }
  }
  if ((m = t.match(CREATE_RE)) || (m = t.match(CREATE_NEW_RE))) {
    return tryMatch('create_file', clip(m[1] || t))
  }
  if ((m = t.match(MAIL_RE)) || (m = t.match(MAIL_SEND_RE))) {
    return tryMatch('mail', clip(m[1] || 'البريد'))
  }
  if (MAIL_SOFT_RE.test(t)) return tryMatch('mail', 'صندوق الوارد')
  if ((m = t.match(CAL_BOOK_RE))) {
    return tryMatch('calendar_book', clip(m[1] || t))
  }
  if ((m = t.match(TASK_RE))) {
    return tryMatch('task', clip(m[1] || t))
  }
  if ((m = t.match(WIKI_RE))) {
    const q = clip(m[1] || '')
    if (q.length >= 2) return tryMatch('wiki', q)
  }
  if ((m = t.match(MATH_RE))) {
    const q = clip(m[1] || '')
    if (q.length >= 1) return tryMatch('math', q)
  }
  if ((m = t.match(YT_RE))) {
    const q = clip(m[1] || '')
    if (q.length >= 4) return tryMatch('youtube', q)
  }
  if (NOTIFY_RE.test(t)) {
    return tryMatch('notify', stripLead(t, /^(?:أرسل|ارسل|بل[ّ]?غ|بلغ)\s+/iu))
  }
  if ((m = t.match(EDIT_RE)) || (m = t.match(SUMMARIZE_FILE_RE))) {
    // Avoid stealing pure create / web
    if (!CREATE_RE.test(t) && !WEB_RE.test(t)) {
      return tryMatch('edit_file', clip(m[1] || t))
    }
  }

  return null
}

/** Map short-intent kind → TelegramWorkKind label used by power-path. */
export function shortIntentToWorkKind(
  kind: NonNullable<TelegramShortIntentKind>
):
  | 'appointment'
  | 'task'
  | 'file'
  | 'mail'
  | 'message'
  | 'question' {
  switch (kind) {
    case 'calendar_book':
      return 'appointment'
    case 'calendar_list':
      // Keep as question so fast-path calendar_count can answer without full agent.
      return 'question'
    case 'task':
      return 'task'
    case 'create_file':
    case 'edit_file':
    case 'archive':
    case 'mesh':
    case 'ocr':
      return 'file'
    case 'mail':
      return 'mail'
    case 'notify':
      return 'message'
    default:
      return 'question'
  }
}

/** Prompt block when a short intent matched. */
export function shortIntentPromptBlockAr(
  intent: TelegramShortIntent | null
): string {
  if (!intent) return ''
  return intent.nudgeAr
}
