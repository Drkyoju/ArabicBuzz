/**
 * Telegram ↔ room parity helpers (max power):
 * - Arabic work intents (موعد / مهمة / ملف / بريد / رسالة / إيقاظ)
 * - Wake cascade (وكيل١ → ٢…) like the site room
 * - Full native tool surface on every non-casual turn
 */

import {
  agentsForScope,
  findMentionedAgents,
  isAgentTeamBroadcastToken,
  type RoomAgent,
} from '@/lib/rooms/agents'
import {
  resolveRoomMessageIntent,
  roomIntentPromptNudge,
} from '@/lib/rooms/voice-intent'
import { pickAgentSeatsForMessage } from '@/lib/rooms/wake-policy'
import { planRoomRunAdaptation } from '@/lib/rooms/run-adapt'
import { effortToRunParams, type RunEffort } from '@/lib/ai/run-effort'
import { listGoogleAccounts } from '@/lib/google/tokens'
import { looksLikeTelegramMessaging } from '@/lib/telegram/message-intent'

export type TelegramWorkKind =
  | 'appointment'
  | 'task'
  | 'file'
  | 'mail'
  | 'message'
  | 'question'
  | 'casual'

export type TelegramWorkIntent = {
  kind: TelegramWorkKind
  labelAr: string
  /** Prefer heavy model + fuller tools. */
  forceHeavy: boolean
  /** Skip catalog assistant shortcut — run full room-like agent. */
  preferFullAgent: boolean
}

const APPOINTMENT_RE =
  /(?:موعد|مواعيد|اجتماع|لقاء|جدو[لّ]|احجز|احجزي|احجزوا|أضف\s*(?:موعد|اجتماع)|سج[ّل]\s*(?:موعد|اجتماع)|cancel\s*meeting|meeting|appointment|calendar|تقويم|أجندة|اجندة)/iu

const TASK_RE =
  /(?:مهم[ةه]|مهام|تاسك|task|to-?do|أضف\s*مهم|سج[ّل]\s*مهم|ذك[ّر]ني|تذكير|تابع|متابعة|checklist)/iu

const FILE_RE =
  /(?:ملف|ملفات|مستند|وثيق|لائح|عقد|نموذج|جدول|ورد|وورد|word|excel|xlsx|pdf|pptx|باور|حو[ّ]?ل|عد[ّ]?ل|نس[ّ]?ق|تنسيق|نظ[ّ]?م|تنظيم|رت[ّ]?ب|هي[ّ]?ئ|احذف|حذف|امسح|استخرج|ocr|درايف|drive|عقل\s*الشركة|قاعدة\s*المعرفة|ابحث\s*عن\s*(?:ال)?(?:ملف|لائح|مستند|عقد)|زامن\s*(?:ال)?درايف|جيب\s*(?:لي\s*)?(?:ال)?(?:ملف|لائح|مستند|عقد)|هات\s*(?:ال)?(?:ملف|لائح|مستند|عقد)|عطني\s*(?:ال)?(?:ملف|لائح|مستند|عقد)|نز[ّ]?ل\s*(?:ال)?(?:ملف|لائح|مستند|عقد)|ور[ّ]?ي?ني\s*(?:ال)?(?:ملف|لائح|مستند|عقد)|أبغ[اى]\s*(?:ال)?(?:ملف|لائح|مستند|عقد)|ابغى\s*(?:ال)?(?:ملف|لائح|مستند|عقد)|أرسل\s*(?:ال)?(?:ملف|لائح)|ارسل\s*(?:ال)?(?:ملف|لائح)|عل[ّ]?ق|تعليق|تمييز|ملاحظة\s*لاصق|pdf_annotate|امسح\s*ضوئي|قراءة\s*مسح)/iu

const MAIL_RE =
  /(?:بريد|إيميل|ايميل|إيميل|رسالة\s*إلكتروني|email|gmail|inbox|صندوق\s*(?:ال)?وارد|أرسل\s*(?:بريد|إيميل|ايميل)|رد\s*على\s*(?:ال)?بريد|mail_search|mail_send|ابحث\s*في\s*(?:ال)?بريد)/iu

const QUESTION_RE =
  /(?:\?|؟|كم|متى|وين|أين|ماذا|ما\s+هو|وش|شو|هل|ليش|لماذا|كيف|لخ[ّ]?ص|ابحث|دور|وين\s+(?:ال)?(?:ملف|لائح|مستند|موعد|مهم))/u

/** Morning brief / daily digest asks. */
const DIGEST_RE =
  /(?:إحاطة|احاطة|ملخص\s*(?:ال)?(?:صباح|يوم|اليوم)|صباح(?:ي|ك)?\s*(?:ال)?(?:إحاطة|ملخص|تقرير)|morning\s*brief|وش\s*(?:عندنا|عندك)\s*(?:اليوم|الصباح)|أبرز\s*(?:اليوم|الصباح)|ماذا\s*(?:اليوم|الصباح)|تقرير\s*(?:ال)?صباح)/iu

/** Unified site/room search phrasing. */
const ROOM_SEARCH_RE =
  /(?:ابحث\s*(?:في|عبر)?\s*(?:ال)?(?:موقع|غرفة|كل\s*شيء|الجمعية)|دور\s*(?:في\s*)?(?:ال)?(?:موقع|غرفة)|بحث\s*موحّ?د|search\s*(?:the\s*)?(?:site|room))/iu

/** Explicit ask-the-bot / do-work cues (Gulf + MSA). */
const ACTION_RE =
  /(?:أبغا|ابغا|أبغى|ابغى|أبي|ابي|أريد|اريد|عايز|بدي|ودي|سوي|سوّي|سوّ|نف[ّ]?ذ|جيب|هات|عطني|نز[ّ]?ل|حم[ّ]?ل|افتح|ور[ّ]?ي?ني|وريني|احذف|حذف|امسح|عد[ّ]?ل|حو[ّ]?ل|نس[ّ]?ق|نظ[ّ]?م|رت[ّ]?ب|هي[ّ]?ئ|لخ[ّ]?ص|اشرح|وض[ّ]?ح|ابحث|دور|جه[ّ]?ز|حض[ّ]?ر|اكتب|أنشئ|انشئ)/iu

/** Clear work verbs — used with vocatives so «يا فلان سوي…» is not treated as casual. */
const CLEAR_WORK_VERB_RE =
  /(?:سو[يّ]|جيب|ابحث|حو[ّ]?ل|هات|عطني|نز[ّ]?ل|ور[ّ]?ي?ني|نف[ّ]?ذ|عد[ّ]?ل|نس[ّ]?ق|نظ[ّ]?م|رت[ّ]?ب)/iu

/** Person-name vocative (يا أحمد / يا سارة…). */
const PERSON_VOCATIVE_RE = /يا\s+[\u0600-\u06FFa-zA-Z]{2,}/u

/** Explicit seat wake / agent mention — prefer full room agent turn. */
const WAKE_RE =
  /(?:أيقظ|ايقاظ|وق[ّ]?ظ|wake)\s*(?:ال)?(?:وكيل|agent)|(?:يا\s+)?وك[يـ]?ل[٠-٩0-9]+|@(?:وكيل|agent)[\u0600-\u06FF0-9a-z_\-]*|وك[ّ]?ل\s+(?:ال)?وكيل|شغ[ّ]?ل\s+(?:ال)?وكيل|(?:للوكلاء|أبغا\s+للجميع)/iu

/**
 * People talking to each other — not a bot request.
 * Keep silent; do not interrupt group social chat.
 */
const HUMAN_CHAT_ONLY_RE =
  /^(?:يا\s+[\u0600-\u06FFa-zA-Z]{2,}(?:\s+[\u0600-\u06FF]{0,20}){0,6}|هههه+(?:\s*تمام)?|ههه+|لول|lol|lmao|طيب\s+وياك|إن\s*شاء\s*الله|ماشي|خلاص|وكيفك|كيفك|كيف\s*الحال|كيف\s*الجو|وش\s*أخبارك|وش\s*رأيك|وش\s*رايك|وينك\b|مع السلامة|يلا|يالله|تمام\s*هههه*)[\s!.؟?…]*$/iu

/** Short social questions / reactions — not for the bot when alone. */
const SHORT_SOCIAL_QUESTION_RE =
  /(?:رايك|رأيك|عنك|عندك\s*خبر|سمعت|يا\s+[\u0600-\u06FF]{2,}|كيف\s*الجو|هههه+\s*تمام|تمام\s*هههه*|وش\s*رأيك\s+يا|وش\s*رايك\s+يا)/iu

/**
 * Light subset — only used for pure greetings / short thanks.
 * Work turns bind the full native toolset (site parity).
 */
export const TELEGRAM_SITE_CHAT_TOOLS = [
  'search_knowledge_base',
  'room_search',
  'memory_search',
  'list_workspace_files',
  'list_files',
  'read_file',
  'read_document',
  'read_excel',
  'return_file',
  'edit_document',
  'edit_excel',
  'write_file',
  'brain_open_document',
  'brain_save_document',
  'room_calendar_list',
  'room_calendar_create',
  'room_calendar_update',
  'room_calendar_cancel',
  'room_calendar_ingest',
  'room_calendar_reconcile',
  'room_tasks_list',
  'room_tasks_create',
  'room_tasks_update',
  'room_tasks_reconcile',
  'room_memory_list',
  'room_memory_add',
  'owner_morning_brief',
  'list_letter_templates',
  'letter_fill_template',
  'minutes_from_thread',
  'send_message',
  'notify_room_member',
  'send_file',
  'web_search',
  'web_fetch',
  'research_task_tools',
  'convert_document',
  'convert_file',
  'gmail_search',
  'gmail_read',
  'mail_search',
  'mail_read',
  'mail_sync',
] as const

/** Heavy / file / OCR / mail send / Drive — still used when fullRoom=false. */
export const TELEGRAM_SITE_HEAVY_TOOLS = [
  ...TELEGRAM_SITE_CHAT_TOOLS,
  'pdf_create',
  'pdf_stamp',
  'pdf_annotate',
  'pdf_merge',
  'pdf_duplicate_page',
  'pdf_insert_blank_page',
  'pdf_list_fields',
  'pdf_fill_form',
  'pdf_replace_text',
  'arabic_ocr',
  'edit_image',
  'generate_image_edit',
  'brain_create_document',
  'fill_policy_audit',
  'read_decision_document',
  'drive_sync_brain',
  'drive_list_files',
  'drive_search_files',
  'drive_upload_file',
  'drive_get_link',
  'gmail_send',
  'mail_send',
  'sheets_read',
  'sheets_write',
  // Team agenda = room_calendar_* only (personal Google calendar tools stay off Telegram).
  'ingest_url_to_brain',
  'trigger_workflow',
  'report_room_attendance',
  'send_director_digest',
  'delete_file',
  'brain_delete_document',
] as const

const busyByScope = new Map<string, { ids: Set<string>; until: number }>()

function busySetFor(scopeId: string): Set<string> {
  const row = busyByScope.get(scopeId)
  if (!row || row.until < Date.now()) {
    busyByScope.delete(scopeId)
    return new Set()
  }
  return row.ids
}

export function markTelegramSeatBusy(scopeId: string, agentId: string) {
  const ids = busySetFor(scopeId)
  ids.add(agentId)
  busyByScope.set(scopeId, { ids, until: Date.now() + 90_000 })
}

export function markTelegramSeatFree(scopeId: string, agentId: string) {
  const row = busyByScope.get(scopeId)
  if (!row) return
  row.ids.delete(agentId)
  if (!row.ids.size) busyByScope.delete(scopeId)
}

export function classifyTelegramWorkIntent(raw: string): TelegramWorkIntent {
  const t = (raw || '').trim()
  if (!t || t.length < 2) {
    return {
      kind: 'casual',
      labelAr: 'فارغ',
      forceHeavy: false,
      preferFullAgent: false,
    }
  }

  if (
    /^(?:السلام\s*عليكم|سلام|مرحبا|مرحباً|أهلا|اهلا|هلا|شكرا|شكراً|مشكور|تسلم|صباح\s*الخير|مساء\s*الخير|تمام|طيب|اوك|أوك|ok)[\s!.؟?…]*$/iu.test(
      t
    )
  ) {
    return {
      kind: 'casual',
      labelAr: 'تحية',
      forceHeavy: false,
      preferFullAgent: false,
    }
  }

  // Social chat between people — not for the bot (unless also a clear work ask).
  // Vocative + work verb («يا أحمد سوي / جيب / ابحث / حوّل») = work, not casual.
  const vocativeWork =
    PERSON_VOCATIVE_RE.test(t) && CLEAR_WORK_VERB_RE.test(t)
  if (
    HUMAN_CHAT_ONLY_RE.test(t) &&
    !vocativeWork &&
    !FILE_RE.test(t) &&
    !MAIL_RE.test(t) &&
    !APPOINTMENT_RE.test(t) &&
    !TASK_RE.test(t) &&
    !WAKE_RE.test(t) &&
    !ACTION_RE.test(t)
  ) {
    return {
      kind: 'casual',
      labelAr: 'دردشة بشرية',
      forceHeavy: false,
      preferFullAgent: false,
    }
  }

  if (looksLikeTelegramMessaging(t)) {
    return {
      kind: 'message',
      labelAr: 'رسالة / تبليغ',
      forceHeavy: false,
      preferFullAgent: true,
    }
  }
  if (WAKE_RE.test(t)) {
    return {
      kind: 'question',
      labelAr: 'إيقاظ وكيل',
      forceHeavy: t.length > 180 || FILE_RE.test(t) || MAIL_RE.test(t),
      preferFullAgent: true,
    }
  }
  if (MAIL_RE.test(t)) {
    return {
      kind: 'mail',
      labelAr: 'بريد',
      forceHeavy: true,
      preferFullAgent: true,
    }
  }
  if (APPOINTMENT_RE.test(t) && !/كم\s*(?:موعد|مواعيد)/i.test(t)) {
    return {
      kind: 'appointment',
      labelAr: 'موعد',
      forceHeavy: false,
      preferFullAgent: true,
    }
  }
  if (FILE_RE.test(t)) {
    return {
      kind: 'file',
      labelAr: 'ملف',
      forceHeavy: true,
      preferFullAgent: true,
    }
  }
  if (TASK_RE.test(t)) {
    return {
      kind: 'task',
      labelAr: 'مهمة',
      forceHeavy: false,
      preferFullAgent: true,
    }
  }
  if (DIGEST_RE.test(t)) {
    return {
      kind: 'question',
      labelAr: 'إحاطة صباح',
      forceHeavy: false,
      preferFullAgent: true,
    }
  }
  if (ROOM_SEARCH_RE.test(t)) {
    return {
      kind: 'question',
      labelAr: 'بحث غرفة',
      forceHeavy: true,
      preferFullAgent: true,
    }
  }
  if (ACTION_RE.test(t) || QUESTION_RE.test(t)) {
    // Short social questions to people (وش رايك / كيف الجو…) — not for the bot.
    // QUESTION_RE alone on short lines needs a stronger non-social signal.
    if (
      !ACTION_RE.test(t) &&
      t.length < 64 &&
      SHORT_SOCIAL_QUESTION_RE.test(t) &&
      !FILE_RE.test(t) &&
      !MAIL_RE.test(t) &&
      !APPOINTMENT_RE.test(t) &&
      !TASK_RE.test(t) &&
      !CLEAR_WORK_VERB_RE.test(t)
    ) {
      return {
        kind: 'casual',
        labelAr: 'دردشة بشرية',
        forceHeavy: false,
        preferFullAgent: false,
      }
    }
    return {
      kind: 'question',
      labelAr: ACTION_RE.test(t) ? 'طلب عمل' : 'سؤال',
      forceHeavy: t.length > 220 || FILE_RE.test(t) || MAIL_RE.test(t),
      preferFullAgent: true,
    }
  }
  // Long instructional paragraph with do-work verbs already caught by ACTION_RE.
  // Bare long social chatter stays casual so we do not interrupt the group.
  return {
    kind: 'casual',
    labelAr: 'دردشة',
    forceHeavy: false,
    preferFullAgent: false,
  }
}

function workKindNudge(kind: TelegramWorkKind): string {
  switch (kind) {
    case 'appointment':
      return [
        '[قصد تيليجرام: موعد]',
        'استخرج العنوان والتاريخ/الوقت (توقيت السعودية Asia/Riyadh).',
        'أنشئ فوراً عبر room_calendar_create (أو room_calendar_ingest إن وُجدت عدة تواريخ).',
        'لا تسأل «هل تود الإضافة؟» — نفّذ ثم أكّد بالعربية: العنوان · الوقت · أنّه في تقويم الغرفة.',
        'إن نقص التاريخ: افترض أقرب يوم عمل معقول واذكر الافتراض صراحة.',
      ].join(' ')
    case 'task':
      return [
        '[قصد تيليجرام: مهمة]',
        'أنشئ/حدّث عبر room_tasks_create أو room_tasks_update فوراً.',
        'لخّص ما سُجّل في لوحة مهام الغرفة.',
      ].join(' ')
    case 'file':
      return [
        '[قصد تيليجرام: ملف — تيليجرام أولاً]',
        'إن وُجد fileId لمرفق تيليجرام في الرسالة: هذه نسخة العمل الوحيدة — اقرأها/عدّلها/حوّلها مباشرة ثم return_file كمرفق تيليجرام.',
        'ممنوع منعاً باتاً: brain_open_document / drive_search / تطابق تقريبي بالاسم («معلم»→ملف آخر) / أي بديل من Drive أو الويب.',
        'إن تعذّر قراءة بايتات المرفق: اعتذر بالعربية واطلب إعادة الإرسال — لا تختار ملفاً آخر.',
        'بدون مرفق تيليجرام صريح: list_workspace_files بالمعرّف/الاسم المطابق حرفياً فقط. Drive فقط عند طلب صريح لاسم/معرّف Drive كامل.',
        'مزامنة Drive اختيارية بعد النجاح — لا تفشل ولا تتوقف إن لم يُربط Google.',
        'لا تستدعِ drive_sync_brain إلا بطلب مزامنة صريح («زامن الدرايف»).',
        'OCR للصور/PDF الممسوح: arabic_ocr. تعليق PDF: pdf_annotate أو pdf_stamp ثم return_file.',
        'إدراج/نسخ صفحات PDF: pdf_duplicate_page (نسخ محتوى صفحة 48 بعد 45) — ليس صفحة بيضاء إلا إذا طُلبت صراحة mode=blank. ثم return_file.',
        'PDF عربي: فضّل pdf_replace_text (HarfBuzz/PyMuPDF). إعادة بناء PDF بـ edit_document قد تضعف اتصال الحروف — كن صادقاً إن فشل الاستبدال.',
      ].join(' ')
    case 'mail':
      return [
        '[قصد تيليجرام: بريد]',
        'صندوق الجمعية (IMAP): mail_search / mail_read / mail_send / mail_sync — متاح لأعضاء الجلسة المسجّلين.',
        'Gmail الشخصي المربوط: gmail_search / gmail_read / gmail_send.',
        'بحث شامل (بريد+ملفات+تقويم): room_search — لا يشمل Gmail الشخصي للأعضاء.',
        'نفّذ فوراً ثم لخّص النتائج بالعربية (المرسل · الموضوع · مقتطف). لا تختلق رسائل.',
        'قبل الإرسال: أكّد المستلم والموضوع بإيجاز بعد التنفيذ.',
      ].join(' ')
    case 'message':
      return [
        '[قصد تيليجرام: رسالة / تبليغ / تنسيق]',
        'استخرج اسم المستلم ونص الرسالة.',
        'نفّذ فوراً عبر notify_room_member (اسم العضو + النص) أو send_message.',
        'إن كان الطلب للمجموعة/الفريق استخدم targetNameAr=المجموعة أو البث عبر الأداة.',
        'حدود صادقة: البوت لا يرسل خاصاً لمن لم يضغط Start سابقاً — عند الفشل انشر في المجموعة المربوطة واشرح السبب.',
        'لا تختلق أن الرسالة وصلت خاصاً إن فشلت الأداة.',
      ].join(' ')
    case 'question':
      return [
        '[قصد تيليجرام: سؤال / إيقاظ وكيل / طلب عمل / إحاطة]',
        'أنت مقعد غرفة الموقع — نفّذ فوراً دون انتظار أوامر إضافية.',
        'إحاطة/ملخص اليوم: owner_morning_brief فوراً وأعد textAr كما هو.',
        'بحث عام في الغرفة/الموقع: room_search أولاً (بريد جمعية · ملفات · تقويم) ثم فصّل بأدوات متخصصة إن لزم.',
        'استخدم كل أدوات الغرفة المتاحة (تقويم/مهام/ملفات/Drive/بريد/تبليغ/بحث/تحويل) ثم لخّص ما نُفّذ.',
        'إن ذُكر وكيل٢ أو انشغل وكيل١ اتبع سياسة الإيقاظ في الغرفة.',
      ].join(' ')
    default:
      return ''
  }
}

/**
 * Build the user prompt for the Telegram agent turn (room intent + work kind).
 */
export function buildTelegramPowerPrompt(opts: {
  raw: string
  scopeId: string
  work: TelegramWorkIntent
}): {
  prompt: string
  roomAgents: RoomAgent[]
  wakeAgent: RoomAgent | null
  wakeNoticeAr?: string
  adapt: ReturnType<typeof planRoomRunAdaptation>
} {
  const catalog = agentsForScope(opts.scopeId)
  const mentioned = findMentionedAgents(opts.raw, catalog)
  const wantsAll = (() => {
    const m = opts.raw.match(/@([\u0600-\u06FFa-zA-Z0-9_\-]+)/)
    return Boolean(m && isAgentTeamBroadcastToken(m[1]))
  })()

  const roomIntent = resolveRoomMessageIntent(opts.raw, catalog)
  const directed =
    mentioned.length > 0
      ? mentioned
      : roomIntent.kind === 'directed'
        ? roomIntent.agents
        : []
  const pick = pickAgentSeatsForMessage({
    seated: catalog,
    busyAgentIds: busySetFor(opts.scopeId),
    mentioned: directed,
    wantsAll: wantsAll || roomIntent.kind === 'broadcast',
    teamCap: 4,
  })

  const wakeAgent = pick.agents[0] || catalog[0] || null
  const adapt = planRoomRunAdaptation({
    prompt: roomIntent.cleanPrompt || opts.raw,
    baseEffort: wakeAgent?.preferredEffort || 'LOW',
    baseModel: wakeAgent?.preferredModel,
    currentAgent: wakeAgent,
    catalog,
    hasAttachments:
      opts.work.kind === 'file' || opts.work.kind === 'mail',
    allowHandoff: !mentioned.length && !wantsAll,
  })

  const handoff = adapt.handoffAgent
  const runAgent = handoff || wakeAgent

  const parts = [
    roomIntent.cleanPrompt || opts.raw,
    roomIntentPromptNudge(roomIntent),
    workKindNudge(opts.work.kind),
    runAgent
      ? `\n[مقعد الغرفة: ${runAgent.nameAr} @${runAgent.slug} — نفس قدرات وكلاء الموقع كاملة]`
      : '',
    adapt.noticesAr.length
      ? `[تكييف: ${adapt.noticesAr.join(' · ')}]`
      : '',
  ]

  return {
    prompt: parts.filter(Boolean).join('\n'),
    roomAgents: catalog,
    wakeAgent: runAgent,
    wakeNoticeAr: pick.noticeAr || adapt.noticesAr[0],
    adapt,
  }
}

export function telegramEffortMaxSteps(
  effort: RunEffort,
  heavy: boolean
): number {
  const base = effortToRunParams(effort).maxSteps
  if (heavy) return Math.max(base, 8)
  return Math.max(base, 6)
}

export async function telegramGoogleLinkedHintAr(
  requesterId: string
): Promise<string | null> {
  try {
    const accounts = await listGoogleAccounts(requesterId)
    if (accounts.length) return null
  } catch {
    /* treat as unlinked */
  }
  return (
    'ملاحظة اختيارية: Google غير مربوط — أدوات Drive/Gmail/Sheets قد تفشل. ' +
    'هذا لا يمنع العمل على مرفقات تيليجرام أو خزنة الغرفة: نفّذ عليها وأعد الناتج بـ return_file. ' +
    'لربط Google لاحقاً: https://arabicbuzz-fooc9h.cranl.net/?section=settings — بريد الجمعية (IMAP) يعمل دون Google إن رُبط الصندوق.'
  )
}

export const TELEGRAM_LIMITS_SYSTEM_AR = `حدود صادقة + قدرات كاملة:
- أنت = نفس وكلاء غرفة الموقع: أدوات أصلية كاملة على طلبات العمل (ملفات تيليجرام/خزنة، تحويل، OCR، تقويم الغرفة، مهام، بريد، خطابات، محاضر، تبليغ، بحث موحّد room_search، إحاطة الصباح، تعليق PDF). Drive اختياري.
- أيقظ وكيل١ ثم وكيل٢ عند الانشغال؛ «يا وكيل١» / «أبغا للجميع» يوجّهان المقاعد.
- مرفق تيليجرام (fileId في الرسالة) = نسخة العمل. نفّذ عليه فوراً وأعد الناتج بـ return_file كمرفق تيليجرام. ممنوع رفض الطلب لأن الملف «ليس على Drive».
- عقل الشركة (Drive): اختياري بعد النجاح إن رُبط Google؛ بدون ربط أكمل من خزنة الغرفة/تيليجرام فقط.
- مشاركة ACL على Drive غير متاحة — أعِد webViewLink فقط عند توفره.
- بريد الجمعية (mail_*): متاح لأعضاء الجلسة المسجّلين — لا تقصر الاستخدام على المالك.
- Gmail الشخصي: ربط Google + ربط حساب تيليجرام الشخصي إن وُجد (/link account).
- الرسائل لشخص: notify_room_member — خاص فقط إن ضغط المستلم Start؛ وإلا منشور في المجموعة المربوطة. لا تختلق وصول خاص.
- الحذف فقط يحتاج موافقة بشرية (أزرار) على ملفات الغرفة/Drive — ممنوع حذف رسائل تيليجرام نهائياً (عدّل أو اترك + رد جديد).
- التقويم الجماعي: room_calendar_* فقط (Asia/Riyadh) مع تنبيه التعارض. لا تختلق مواعيد.
- خطابات: list_letter_templates / letter_fill_template. محاضر: minutes_from_thread.
- في المجموعة: القصد يحدد الرد — طلب عمل → نفّذ واردّ بالناتج بدون منشن؛ دردشة بشرية → صامت. المنشن اختياري.
- لست نسخة بصرية من الموقع: لا لوحة TipTap ولا سبورة tldraw ولا أداة رسم PDF بالقلم — نفّذ المكافئ عبر الأدوات (pdf_annotate / edit_document / draft HTML في البريد).
- PDF: استبدال عربي عبر pdf_replace_text أدق؛ تعليق عبر pdf_annotate؛ لا تعتمد على إعادة بناء pdf-lib لنص عربي متصل.`
