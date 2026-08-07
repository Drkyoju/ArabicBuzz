/**
 * Telegram ↔ room parity helpers:
 * - Arabic work intent (موعد / مهمة / ملف / سؤال)
 * - Wake cascade (وكيل١ → ٢…) like the site room
 * - Tool allow-lists closer to /api/chat
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
  /(?:موعد|مواعيد|اجتماع|لقاء|جدو[لّ]|احجز|احجزي|احجزوا|أضف\s*(?:موعد|اجتماع)|سج[ّل]\s*(?:موعد|اجتماع)|cancel\s*meeting|meeting|appointment|calendar|تقويم)/iu

const TASK_RE =
  /(?:مهم[ةه]|مهام|تاسك|task|to-?do|أضف\s*مهم|سج[ّل]\s*مهم|ذك[ّر]ني|تذكير|تابع|متابعة)/iu

const FILE_RE =
  /(?:ملف|ملفات|مستند|وثيق|لائح|عقد|نموذج|جدول|ورد|وورد|word|excel|xlsx|pdf|pptx|باور|حو[ّ]?ل|عد[ّ]?ل|استخرج|ocr|درايف|drive|عقل\s*الشركة|قاعدة\s*المعرفة|ابحث\s*عن\s*(?:ال)?(?:ملف|لائح))/iu

const QUESTION_RE =
  /(?:\?|؟|كم|متى|وين|أين|ماذا|ما\s+هو|وش|شو|هل|ليش|لماذا|كيف)/u

/** Chat turns — same core surface as room (no slow Drive full-sync / RPA by default). */
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
  'web_search',
  'web_fetch',
  'convert_document',
  'convert_file',
] as const

/** File / OCR / mail / Drive pull — closer to site heavy turns. */
export const TELEGRAM_SITE_HEAVY_TOOLS = [
  ...TELEGRAM_SITE_CHAT_TOOLS,
  'pdf_create',
  'pdf_stamp',
  'pdf_merge',
  'pdf_list_fields',
  'pdf_fill_form',
  'arabic_ocr',
  'edit_image',
  'generate_image_edit',
  'brain_create_document',
  'fill_policy_audit',
  'read_decision_document',
  'drive_sync_brain',
  'gmail_search',
  'gmail_read',
  'mail_search',
  'mail_read',
  'mail_sync',
  'ingest_url_to_brain',
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
    /^(?:السلام\s*عليكم|سلام|مرحبا|مرحباً|أهلا|اهلا|هلا|شكرا|شكراً|مشكور|تسلم|صباح\s*الخير|مساء\s*الخير)[\s!.؟?…]*$/iu.test(
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
  if (QUESTION_RE.test(t) || t.length >= 40) {
    return {
      kind: 'question',
      labelAr: 'سؤال',
      forceHeavy: t.length > 280 || FILE_RE.test(t),
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
        'OCR للصور/PDF الممسوح: arabic_ocr (جودة أعلى إن توفّر جسر ماك؛ وإلا مسار السحابة).',
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
        '[قصد تيليجرام: سؤال]',
        'أجب مباشرة؛ استخدم أدوات البحث/التقويم/الملفات عند الحاجة ثم لخّص ما نُفّذ.',
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
    hasAttachments: opts.work.kind === 'file',
    allowHandoff: !mentioned.length && !wantsAll,
  })

  const handoff = adapt.handoffAgent
  const runAgent = handoff || wakeAgent

  const parts = [
    roomIntent.cleanPrompt || opts.raw,
    roomIntentPromptNudge(roomIntent),
    workKindNudge(opts.work.kind),
    runAgent
      ? `\n[مقعد الغرفة: ${runAgent.nameAr} @${runAgent.slug} — نفس قدرات وكلاء الموقع]`
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
  if (heavy) return Math.max(base, 6)
  return Math.max(base, 4)
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
    'OCR الممسوح أدق مع جسر ماك إن وُجد؛ وإلا مسار سحابة محدود.'
  )
}

export const TELEGRAM_LIMITS_SYSTEM_AR = `حدود صادقة:
- عقل الشركة (Drive): يحتاج ربط Google من الموقع؛ بدون ربط استخدم خزنة الغرفة فقط وأخبر المستخدم.
- التحويل PDF↔Word الأفضل عبر Google؛ بدون ربط قد تفشل الجودة أو يُطلب CloudConvert.
- arabic_ocr للصور/PDF الممسوح: يعمل سحابياً؛ المسار البصري عبر جسر ماك اختياري لجودة أعلى.
- الرسائل لشخص: notify_room_member — خاص فقط إن ضغط المستلم Start على البوت سابقاً؛ وإلا منشور موجّه في المجموعة المربوطة. لا تختلق وصول خاص.
- الحذف فقط يحتاج موافقة بشرية (أزرار). باقي العمل يُنفَّذ مباشرة مثل غرفة الموقع.
- أنت نفس وكلاء غرفة الموقع: أيقظ مقعد وكيل١ (ثم ٢…) ونفّذ بالأدوات؛ النتيجة تُرد هنا وتُحفظ في الغرفة.`
