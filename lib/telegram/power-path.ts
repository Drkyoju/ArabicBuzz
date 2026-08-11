/**
 * Telegram ↔ room parity helpers (max power):
 * - Arabic work intents (موعد / مهمة / ملف / بريد / رسالة / إيقاظ)
 * - Wake cascade (وكيل١ → ٢…) like the site room
 * - Full native tool surface on every non-casual turn
 */

import {
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
import {
  getTelegramAgentMaxParallel,
  shouldTelegramTeamFanOut,
} from '@/lib/telegram/agent-pool'
import type { AgentCollabMode } from '@/lib/rooms/agents'
import {
  capabilityCascadePromptNudgeAr,
  shouldEscalateCapabilityCascade,
} from '@/lib/telegram/capability-cascade'
import {
  parseTelegramShortIntent,
  shortIntentPromptBlockAr,
  shortIntentToWorkKind,
} from '@/lib/telegram/short-intent'
import { TELEGRAM_FILE_GOLDEN_RULE_AR } from '@/lib/files/file-source-policy'

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
  /(?:بريد|إيميل|ايميل|إيميل|رسالة\s*إلكتروني|email|gmail|inbox|صندوق\s*(?:ال)?وارد|أرسل\s*(?:بريد|إيميل|ايميل)|رد\s*على\s*(?:ال)?بريد|mail_search|mail_send|ابحث\s*في\s*(?:ال)?بريد|(?:شو|وش|ماذا)\s*(?:في\s*)?(?:ال)?(?:بريد|وارد))/iu

const QUESTION_RE =
  /(?:\?|؟|كم|متى|وين|أين|ماذا|ما\s+هو|وش|شو|هل|ليش|لماذا|كيف|لخ[ّ]?ص|ابحث|دور|وين\s+(?:ال)?(?:ملف|لائح|مستند|موعد|مهم))/u

/** Morning brief / daily digest asks. */
const DIGEST_RE =
  /(?:إحاطة|احاطة|ملخص\s*(?:ال)?(?:صباح|يوم|اليوم)|صباح(?:ي|ك)?\s*(?:ال)?(?:إحاطة|ملخص|تقرير)|morning\s*brief|وش\s*(?:عندنا|عندك)\s*(?:اليوم|الصباح)|أبرز\s*(?:اليوم|الصباح)|ماذا\s*(?:اليوم|الصباح)|تقرير\s*(?:ال)?صباح)/iu

/** Unified site/room search phrasing. */
const ROOM_SEARCH_RE =
  /(?:ابحث\s*(?:في|عبر)?\s*(?:ال)?(?:موقع|غرفة|كل\s*شيء|الجمعية)|دور\s*(?:في\s*)?(?:ال)?(?:موقع|غرفة)|بحث\s*موحّ?د|search\s*(?:the\s*)?(?:site|room))/iu

/** Google / web search (free DDG path — not room_search). */
const WEB_SEARCH_RE =
  /(?:ابحث\s*(?:في|عبر|على)?\s*(?:ال)?(?:جوجل|google|ويب|انترنت|الشبكة|duckduckgo)|بحث\s*(?:ويب|جوجل|google)|google\s*search|web\s*search|دور\s*(?:لي\s*)?(?:في\s*)?(?:ال)?(?:جوجل|google|ويب))/iu

/** Location / maps online. */
const MAPS_RE =
  /(?:أين\s*(?:تقع|موقع)?|وين\s*(?:تقع|موقع)?|موقع\s+(?:ال|على\s*)?(?:خريط|جوجل|maps)|خريط[ةه]|إحداثي|geocode|google\s*maps|openstreetmap|أعطني\s*(?:موقع|خريط)|أرسل\s*(?:موقع|خريط)|رابط\s*(?:ال)?(?:موقع|خريط))/iu

/**
 * Create a brand-new file from text/voice (not edit an existing TG attachment).
 * Keep narrower than FILE_RE so «عدّل الملف» stays edit.
 */
const CREATE_FILE_RE =
  /(?:أنشئ|انشئ|اكتب|سو[يّ]|جه[ّ]?ز|حض[ّ]?ر)\s*(?:لي\s*)?(?:ملف|مستند|وثيق|مذكرة|ملاحظة|نص|ورد|وورد|word|pdf|docx)|(?:ملف|مستند)\s*جديد|من\s*(?:الصفر|scratch)|create\s*(?:a\s*)?(?:new\s*)?(?:file|doc|document)|(?:صوت|تفريغ).{0,40}(?:ملف|مستند)\s*(?:جديد|من)/iu

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
  'wikipedia_lookup',
  'youtube_transcript',
  'math_eval',
  'domain_intel',
  'arxiv_search',
  'fx_rate',
  'geocode',
  'dictionary_lookup',
  'hn_search',
  'research_task_tools',
  'convert_document',
  'convert_file',
  'gmail_search',
  'gmail_read',
  'mail_search',
  'mail_read',
  'mail_sync',
  // Drive + PDF reads for association work (light turns)
  'drive_list_files',
  'drive_search_files',
  'drive_get_link',
  'find_storage_mesh',
  'archive_telegram_group',
  'pdf_list_fields',
  'pdf_annotate',
  'pdf_duplicate_page',
  'pdf_merge',
  'arabic_ocr',
  'sheets_read',
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
  'find_storage_mesh',
  'archive_telegram_group',
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

export function looksLikeTelegramCreateFile(raw: string): boolean {
  return CREATE_FILE_RE.test((raw || '').trim())
}

export function looksLikeTelegramWebSearch(raw: string): boolean {
  return WEB_SEARCH_RE.test((raw || '').trim())
}

export function looksLikeTelegramMaps(raw: string): boolean {
  return MAPS_RE.test((raw || '').trim())
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

  // Structured short shortcuts win early (اختصارات بدون شرح زائد).
  const short = parseTelegramShortIntent(t)
  if (short) {
    const kind = shortIntentToWorkKind(short.kind)
    return {
      kind,
      labelAr: short.labelAr,
      forceHeavy: short.forceHeavy,
      preferFullAgent: true,
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
    !ACTION_RE.test(t) &&
    !WEB_SEARCH_RE.test(t) &&
    !MAPS_RE.test(t) &&
    !CREATE_FILE_RE.test(t)
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
  // Create-new before appointment/file so «ملف … عن الاجتماع» is not a calendar ask.
  if (CREATE_FILE_RE.test(t)) {
    return {
      kind: 'file',
      labelAr: 'إنشاء ملف',
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
  if (WEB_SEARCH_RE.test(t)) {
    return {
      kind: 'question',
      labelAr: 'بحث ويب',
      forceHeavy: false,
      preferFullAgent: true,
    }
  }
  if (MAPS_RE.test(t)) {
    return {
      kind: 'question',
      labelAr: 'موقع / خريطة',
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

function workKindNudge(kind: TelegramWorkKind, raw = ''): string {
  const shortBlock = shortIntentPromptBlockAr(parseTelegramShortIntent(raw))
  if (shortBlock) return shortBlock
  const createNew = looksLikeTelegramCreateFile(raw)
  const web = looksLikeTelegramWebSearch(raw)
  const maps = looksLikeTelegramMaps(raw)
  switch (kind) {
    case 'appointment':
      return [
        '[قصد تيليجرام: موعد — مواعيد الجمعية/الفريق]',
        'استخرج العنوان والتاريخ/الوقت (توقيت السعودية Asia/Riyadh).',
        'أنشئ فوراً عبر room_calendar_create (أو room_calendar_ingest إن وُجدت عدة تواريخ).',
        'لا تسأل «هل تود الإضافة؟» — نفّذ ثم أكّد بالعربية: العنوان · الوقت · أنّه مواعيد الجمعية/الفريق (تقويم الغرفة) — ليس تقويمك الشخصي على Google.',
        'إن نقص التاريخ: افترض أقرب يوم عمل معقول واذكر الافتراض صراحة.',
        'رد موجز.',
      ].join(' ')
    case 'task':
      return [
        '[قصد تيليجرام: مهمة]',
        'أنشئ/حدّث عبر room_tasks_create أو room_tasks_update فوراً.',
        'لخّص سطراً واحداً ما سُجّل.',
      ].join(' ')
    case 'file':
      if (createNew) {
        return [
          '[قصد تيليجرام: إنشاء ملف من الصفر]',
          'أنشئ ملفاً جديداً فوراً عبر write_file أو brain_create_document أو pdf_create بالمحتوى المطلوب (من النص/تفريغ الصوت).',
          'ثم return_file كمرفق تيليجرام. ممنوع البحث في Drive أولاً. ممنوع طلب توضيح إن المحتوى واضح من الرسالة/الصوت.',
          'رد موجز: اسم الملف + تم الإرسال.',
        ].join(' ')
      }
      return [
        '[قصد تيليجرام: ملف — مرفق الرسالة = نسخة العمل — تلقائي بلا سؤال]',
        TELEGRAM_FILE_GOLDEN_RULE_AR,
        'إن وُجد fileId لمرفق تيليجرام في الرسالة/الذاكرة (حتى أول مرة ولم يُرَ في Drive/غرفة): هذه نسخة العمل — اقرأ/عدّل/لخّص/حوّل مباشرة ثم return_file كمرفق تيليجرام.',
        'ممنوع: brain_open/drive_search كبديل بالتشابه؛ ممنوع «مو بالدرايف» / «ما أعرف وين» / «أعد الإرسال» — إن نقصت البايتات: find_storage_mesh ثم نفّذ؛ إن انتظار hop: أخبر المستخدم بالانتظار أو ملف أصغر أو المحاولة لاحقاً.',
        'تحويل/OCR: إن LibreOffice أو OCR غير متاح على CranL فصرّح — جرّب Drive أولاً أو جسر الماك؛ وإلا غير متاح. ممنوع نجاح مزوّر أو طلاسم.',
        'ممنوع «هل تريد؟». OCR: arabic_ocr. تعليق: pdf_annotate. نسخ صفحة: pdf_duplicate_page ثم return_file.',
        'رد موجز + المرفق.',
      ].join(' ')
    case 'mail':
      return [
        '[قصد تيليجرام: بريد — طلب صريح فقط]',
        'نفّذ mail_* أو gmail_* فوراً ولخّص (مرسل · موضوع · مقتطف). لا تختلق رسائل. رد موجز.',
        'لا تمسح البريد في دورات أخرى بلا طلب صريح عن البريد/الوارد.',
      ].join(' ')
    case 'message':
      return [
        '[قصد تيليجرام: رسالة / تبليغ]',
        'نفّذ notify_room_member فوراً. خاص فقط إن بدأ المستلم Start — وإلا المجموعة واشرح بصراحة سطراً.',
      ].join(' ')
    case 'question':
      if (web) {
        return [
          '[قصد تيليجرام: بحث ويب/جوجل]',
          'نفّذ web_search فوراً (DuckDuckGo+ويكيبيديا+gov.sa — بلا مفتاح). عند الحاجة web_fetch/Jina.',
          'أعد 3–5 نتائج مختصرة بروابط. ممنوع room_search بدل البحث الخارجي. ممنوع شرح مطوّل.',
        ].join(' ')
      }
      if (maps) {
        return [
          '[قصد تيليجرام: موقع / خريطة]',
          'نفّذ geocode فوراً ثم انشر الاسم · الإحداثيات · روابط osmUrl و googleMapsUrl من النتيجة.',
          'رد موجز — بلا محاضرة.',
        ].join(' ')
      }
      return [
        '[قصد تيليجرام: سؤال / طلب عمل / إحاطة]',
        'نفّذ فوراً. إحاطة: owner_morning_brief (بدون mail_* منفصلة). بحث غرفة: room_search. مواعيد: room_calendar_list وسمّها مواعيد الجمعية/الفريق. تذكّر سياق المحادثة أعلاه.',
        'ممنوع استدعاء mail_*/gmail_* إلا إذا طلب المستخدم البريد صراحة.',
        'رد موجز بالنتيجة — ممنوع طلب شرح أطول لطلب واضح/اختصار.',
      ].join(' ')
    default:
      return ''
  }
}

/**
 * Build the user prompt for the Telegram agent turn (room intent + work kind).
 * Pass `catalog` from loadTelegramAgentPool so TG can enlist وكيل١…٨.
 */
export function buildTelegramPowerPrompt(opts: {
  raw: string
  scopeId: string
  work: TelegramWorkIntent
  /** Full seat pool (roster + builtins). Required for multi-seat. */
  catalog: RoomAgent[]
  collabMode?: AgentCollabMode
}): {
  prompt: string
  roomAgents: RoomAgent[]
  /** Primary seat (streams to Telegram ack). */
  wakeAgent: RoomAgent | null
  /** All seats woken this turn (1 = cascade, N = parallel team). */
  wakeAgents: RoomAgent[]
  parallel: boolean
  wakeNoticeAr?: string
  adapt: ReturnType<typeof planRoomRunAdaptation>
} {
  const catalog = opts.catalog.length
    ? opts.catalog
    : ([] as RoomAgent[])
  const mentioned = findMentionedAgents(opts.raw, catalog)
  const wantsAllToken = (() => {
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

  const teamCap = getTelegramAgentMaxParallel()
  const capabilityEscalate = shouldEscalateCapabilityCascade({
    raw: opts.raw,
    workKind: opts.work.kind,
    preferFullAgent: opts.work.preferFullAgent,
    forceHeavy: opts.work.forceHeavy,
  })
  const fanOut =
    capabilityEscalate ||
    shouldTelegramTeamFanOut({
      raw: opts.raw,
      workKind: opts.work.kind,
      preferFullAgent: opts.work.preferFullAgent,
      forceHeavy: opts.work.forceHeavy,
      collabMode: opts.collabMode || 'solo',
      mentionedCount: directed.length,
      wantsAllToken,
      broadcastIntent: roomIntent.kind === 'broadcast',
    })

  const pick = pickAgentSeatsForMessage({
    seated: catalog,
    busyAgentIds: busySetFor(opts.scopeId),
    mentioned: directed,
    wantsAll: fanOut,
    teamCap,
  })

  const wakeAgents = pick.agents
  const wakeAgent = wakeAgents[0] || null
  const parallel = wakeAgents.length > 1

  const adapt = planRoomRunAdaptation({
    prompt: roomIntent.cleanPrompt || opts.raw,
    baseEffort: wakeAgent?.preferredEffort || 'LOW',
    baseModel: wakeAgent?.preferredModel,
    currentAgent: wakeAgent,
    catalog,
    hasAttachments:
      opts.work.kind === 'file' || opts.work.kind === 'mail',
    // No specialty handoff when multi-seat / explicit mention / team fan-out.
    allowHandoff: !mentioned.length && !fanOut && !parallel,
  })

  const handoff = adapt.handoffAgent
  // Handoff only replaces the solo primary; team fan-out keeps all seats.
  // Queue-full (no agents) stays empty — do not invent a seat.
  const runAgents =
    wakeAgents.length === 0
      ? []
      : !parallel && handoff
        ? [handoff]
        : wakeAgents
  const runAgent = runAgents[0] || null

  const seatLine = parallel
    ? `\n[فريق الغرفة (${runAgents.length}): ${runAgents.map((a) => `${a.nameAr}@${a.slug}`).join(' · ')} — نفّذوا معاً دون تكرار عديم الفائدة]`
    : runAgent
      ? `\n[مقعد الغرفة: ${runAgent.nameAr} @${runAgent.slug} — نفس قدرات وكلاء الموقع كاملة]`
      : ''

  const parts = [
    roomIntent.cleanPrompt || opts.raw,
    roomIntentPromptNudge(roomIntent),
    workKindNudge(opts.work.kind, opts.raw),
    opts.work.preferFullAgent
      ? capabilityCascadePromptNudgeAr(opts.raw)
      : '',
    seatLine,
    adapt.noticesAr.length
      ? `[تكييف: ${adapt.noticesAr.join(' · ')}]`
      : '',
  ]

  const teamNotice = parallel
    ? `تشغيل متوازٍ: ${runAgents.map((a) => a.nameAr).join('، ')}`
    : undefined

  return {
    prompt: parts.filter(Boolean).join('\n'),
    roomAgents: catalog,
    wakeAgent: runAgent,
    wakeAgents: runAgents,
    parallel,
    wakeNoticeAr:
      pick.noticeAr || teamNotice || adapt.noticesAr[0],
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

export const TELEGRAM_LIMITS_SYSTEM_AR = `حدود صادقة + قدرات كاملة + تشغيل تلقائي:
- أنت = نفس وكلاء غرفة الموقع على تيليجرام. نفّذ فوراً؛ رد موجز بعد النجاح (نتيجة + مرفق إن وُجد). ممنوع شرح مطوّل أو طلب توضيح لطلب واضح/اختصار.
- ${TELEGRAM_FILE_GOLDEN_RULE_AR}
- ذاكرة الشات إلزامية: سجل هذه المحادثة (مرآة room_posts حسب chatId) + مهام ملفات + مرفقات تيليجرام — لا تنسَ طلباً سابقاً في نفس الشات.
- مرفق تيليجرام في الرسالة (حتى لو أول مرة) = نسخة العمل (عدّل/لخّص/حوّل ثم return_file). إنشاء ملف من الصفر (صوت/نص): write_file / brain_create_document / pdf_create ثم return_file — بلا اشتراط Drive/غرفة.
- بحث جوجل/ويب: web_search (DDG مجاني). موقع/خريطة: geocode + روابط OSM/Google Maps من النتيجة.
- تشغيل تلقائي: ممنوع «هل تريد؟» للعمل الروتيني. المقاطعة الوحيدة = بوابة دفع بعد استنفاد المجاني.
- المقاعد: وكيل١…٨. انشغال → التالي. «أبغا للجميع» → متوازٍ. ملف مفقود بالاسم: find_storage_mesh (تيليجرام→غرفة→Drive→ماك).
- HITL فقط لحذف ملفات الغرفة/Drive أو بوابة الدفع. ممنوع حذف رسائل تيليجرام.
- التقويم: room_calendar_* فقط = مواعيد الجمعية/الفريق (Asia/Riyadh) — ليس تقويمك الشخصي على Google.
- البريد: mail_*/gmail_* فقط عند طلب صريح عن البريد/الوارد — ممنوع مسح غير مطلوب أو دفع للمجموعة.
- تحويل/OCR: إن LibreOffice أو OCR غير متاح على CranL فصرّح — جرّب Drive أولاً أو جسر الماك؛ وإلا غير متاح. ممنوع نجاح مزوّر.
- هيرميس واتساب منفصل تماماً — لا تخلط أدوات/سياق واتساب مع هذا البوت.`
