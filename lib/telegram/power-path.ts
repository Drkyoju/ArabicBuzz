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
  /(?:ملف|ملفات|مستند|وثيق|لائح|عقد|نموذج|جدول|ورد|وورد|word|excel|xlsx|pdf|pptx|باور|حو[ّ]?ل|عد[ّ]?ل|استخرج|ocr|درايف|drive|عقل\s*الشركة|قاعدة\s*المعرفة|ابحث\s*عن\s*(?:ال)?(?:ملف|لائح)|زامن\s*(?:ال)?درايف)/iu

const MAIL_RE =
  /(?:بريد|إيميل|ايميل|إيميل|رسالة\s*إلكتروني|email|gmail|inbox|صندوق\s*(?:ال)?وارد|أرسل\s*(?:بريد|إيميل|ايميل)|رد\s*على\s*(?:ال)?بريد|mail_search|mail_send|ابحث\s*في\s*(?:ال)?بريد)/iu

const QUESTION_RE =
  /(?:\?|؟|كم|متى|وين|أين|ماذا|ما\s+هو|وش|شو|هل|ليش|لماذا|كيف|لخ[ّ]?ص|ابحث|دور)/u

/** Explicit seat wake / agent mention — prefer full room agent turn. */
const WAKE_RE =
  /(?:أيقظ|ايقاظ|وق[ّ]?ظ|wake)\s*(?:ال)?(?:وكيل|agent)|(?:يا\s+)?وك[يـ]?ل[٠-٩0-9]+|@(?:وكيل|agent)[\u0600-\u06FF0-9a-z_\-]*|وك[ّ]?ل\s+(?:ال)?وكيل|شغ[ّ]?ل\s+(?:ال)?وكيل|(?:للوكلاء|أبغا\s+للجميع)/iu

/** Gulf/MSA action cues — treat as work, not idle chat. */
const ACTION_RE =
  /(?:أبغا|ابغا|أبغى|ابغى|أبي|ابي|أريد|اريد|عايز|بدي|ودي|سوي|سوّي|سوّ|نف[ّ]?ذ|جيب|هات|افتح|ور[ّ]?ني|وريني)/iu

/**
 * Light subset — only used for pure greetings / short thanks.
 * Work turns bind the full native toolset (site parity).
 */
export const TELEGRAM_SITE_CHAT_TOOLS = [
  'search_knowledge_base',
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
  'send_message',
  'notify_room_member',
  'send_file',
  'web_search',
  'web_fetch',
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
  'pdf_merge',
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
  'gmail_send',
  'mail_send',
  'sheets_read',
  'sheets_write',
  // Team agenda = room_calendar_* only (personal Google calendar tools stay off Telegram).
  'ingest_url_to_brain',
  'trigger_workflow',
  'report_room_attendance',
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
  if (ACTION_RE.test(t) || QUESTION_RE.test(t) || t.length >= 28) {
    return {
      kind: 'question',
      labelAr: ACTION_RE.test(t) ? 'طلب عمل' : 'سؤال',
      forceHeavy: t.length > 220 || FILE_RE.test(t) || MAIL_RE.test(t),
      preferFullAgent: true,
    }
  }
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
        '[قصد تيليجرام: ملف]',
        'ابحث: search_knowledge_base و/أو list_workspace_files ثم brain_open_document إن لزم من Drive.',
        'عدّل/حوّل (edit_document / convert_document) ثم return_file — الناتج يُرسل كمرفق هنا.',
        'لا تستدعِ drive_sync_brain إلا بطلب مزامنة صريح («زامن الدرايف»).',
        'إن لم يُربط Google: قل ذلك صراحة واعرض خزنة الغرفة فقط — لا تختلق ملفات Drive.',
        'OCR للصور/PDF الممسوح: arabic_ocr.',
      ].join(' ')
    case 'mail':
      return [
        '[قصد تيليجرام: بريد]',
        'صندوق الجمعية (IMAP): mail_search / mail_read / mail_send / mail_sync — متاح لأعضاء الجلسة المسجّلين.',
        'Gmail الشخصي المربوط: gmail_search / gmail_read / gmail_send.',
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
        '[قصد تيليجرام: سؤال / إيقاظ وكيل / طلب عمل]',
        'أنت مقعد غرفة الموقع — نفّذ فوراً دون انتظار أوامر إضافية.',
        'استخدم كل أدوات الغرفة المتاحة (تقويم/مهام/ملفات/Drive/بريد/تبليغ/بحث) ثم لخّص ما نُفّذ.',
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
    'ملاحظة: Google Drive غير مربوط لهذا المالك — البحث/الفتح من عقل الشركة قد يفشل. ' +
    'اربط Google من الموقع (الإعدادات) أو اعمل على ملفات خزنة الغرفة المرفوعة. ' +
    'بريد الجمعية (IMAP) يعمل للأعضاء المسجّلين دون Google إن رُبط الصندوق من الإعدادات.'
  )
}

export const TELEGRAM_LIMITS_SYSTEM_AR = `حدود صادقة + قدرات كاملة:
- أنت = نفس وكلاء غرفة الموقع: أدوات أصلية كاملة على طلبات العمل (ملفات، Drive، تقويم الغرفة، مهام، بريد، تبليغ، بحث، تحويل، OCR).
- أيقظ وكيل١ ثم وكيل٢ عند الانشغال؛ «يا وكيل١» / «أبغا للجميع» يوجّهان المقاعد.
- عقل الشركة (Drive): يحتاج ربط Google من الموقع؛ بدون ربط استخدم خزنة الغرفة فقط وأخبر المستخدم.
- بريد الجمعية (mail_*): متاح لأعضاء الجلسة المسجّلين — لا تقصر الاستخدام على المالك.
- Gmail الشخصي: يحتاج ربط Google لنفس هوية القناة.
- الرسائل لشخص: notify_room_member — خاص فقط إن ضغط المستلم Start؛ وإلا منشور في المجموعة المربوطة. لا تختلق وصول خاص.
- الحذف فقط يحتاج موافقة بشرية (أزرار) على ملفات الغرفة/Drive — ممنوع حذف رسائل تيليجرام نهائياً (عدّل أو اترك + رد جديد).
- التقويم الجماعي: room_calendar_* فقط (Asia/Riyadh). لا تختلق مواعيد.`
