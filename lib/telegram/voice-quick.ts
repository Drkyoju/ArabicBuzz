/**
 * Inline quick-actions after Telegram voice STT.
 */
import { InlineKeyboard } from 'grammy'

export type VoiceQuickAction =
  | 'appointment'
  | 'task'
  | 'file'
  | 'doc'
  | 'mail'
  | 'message'
  | 'broadcast'
  | 'wake'
  | 'run'

type VoiceQuickCache = {
  transcript: string
  scopeId: string
  userId: string
  expiresAt: number
}

/** Last voice transcript per chat — callback buttons reuse it. */
const lastVoiceByChat = new Map<string, VoiceQuickCache>()

const TTL_MS = 30 * 60_000

export function rememberVoiceTranscript(opts: {
  chatId: string
  transcript: string
  scopeId: string
  userId: string
}) {
  const t = opts.transcript.trim()
  if (!t) return
  lastVoiceByChat.set(opts.chatId, {
    transcript: t.slice(0, 3500),
    scopeId: opts.scopeId,
    userId: opts.userId,
    expiresAt: Date.now() + TTL_MS,
  })
}

export function takeVoiceTranscript(chatId: string): VoiceQuickCache | null {
  const row = lastVoiceByChat.get(chatId)
  if (!row) return null
  if (row.expiresAt < Date.now()) {
    lastVoiceByChat.delete(chatId)
    return null
  }
  return row
}

/** Callback data — keep under Telegram’s 64-byte limit. */
export const VOICE_QUICK_PREFIX = {
  appointment: 'vq_appt',
  task: 'vq_task',
  file: 'vq_file',
  doc: 'vq_doc',
  mail: 'vq_mail',
  message: 'vq_msg',
  broadcast: 'vq_cast',
  wake: 'vq_wake',
  run: 'vq_run',
} as const

export function parseVoiceQuickCallback(
  data: string
): VoiceQuickAction | null {
  if (data === VOICE_QUICK_PREFIX.appointment) return 'appointment'
  if (data === VOICE_QUICK_PREFIX.task) return 'task'
  if (data === VOICE_QUICK_PREFIX.file) return 'file'
  if (data === VOICE_QUICK_PREFIX.doc) return 'doc'
  if (data === VOICE_QUICK_PREFIX.mail) return 'mail'
  if (data === VOICE_QUICK_PREFIX.message) return 'message'
  if (data === VOICE_QUICK_PREFIX.broadcast) return 'broadcast'
  if (data === VOICE_QUICK_PREFIX.wake) return 'wake'
  if (data === VOICE_QUICK_PREFIX.run) return 'run'
  return null
}

export function buildVoiceQuickKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ نفّذ', VOICE_QUICK_PREFIX.run)
    .text('📅 موعد', VOICE_QUICK_PREFIX.appointment)
    .row()
    .text('✅ مهمة', VOICE_QUICK_PREFIX.task)
    .text('📄 مستند جاهز', VOICE_QUICK_PREFIX.doc)
    .row()
    .text('📁 عدّل مرفق', VOICE_QUICK_PREFIX.file)
    .text('✉️ بريد', VOICE_QUICK_PREFIX.mail)
    .row()
    .text('👤 لعضو', VOICE_QUICK_PREFIX.message)
    .text('📣 للمجموعة', VOICE_QUICK_PREFIX.broadcast)
    .row()
    .text('🤖 أيقظ وكيل', VOICE_QUICK_PREFIX.wake)
}

export function voiceQuickPrompt(
  action: VoiceQuickAction,
  transcript: string
): { prompt: string; labelAr: string; forceHeavy: boolean } {
  switch (action) {
    case 'run':
      return {
        labelAr: 'تنفيذ',
        forceHeavy: true,
        prompt: [
          transcript,
          '',
          '[زر سريع: نفّذ]',
          'نفّذ الطلب بالكامل بأدوات غرفة الموقع كاملة (تقويم/مهام/ملفات/Drive/بريد/تبليغ) وأعد ملخصاً واضحاً مع المرفقات.',
        ].join('\n'),
      }
    case 'appointment':
      return {
        labelAr: 'موعد',
        forceHeavy: false,
        prompt: [
          transcript,
          '',
          '[زر سريع: موعد]',
          'استخرج العنوان والتاريخ/الوقت (Asia/Riyadh) وأي بريد للمدعوين وأنشئ عبر room_calendar_create فوراً مع attendees.',
          'أكّد بالعربية: العنوان · الوقت · المدعوين · أنه في مواعيد الجمعية (تقويم الغرفة).',
        ].join('\n'),
      }
    case 'task':
      return {
        labelAr: 'مهمة',
        forceHeavy: false,
        prompt: [
          transcript,
          '',
          '[زر سريع: مهمة]',
          'أنشئ مهمة عبر room_tasks_create فوراً ولخّص ما سُجّل.',
        ].join('\n'),
      }
    case 'file':
      return {
        labelAr: 'تعديل مرفق',
        forceHeavy: true,
        prompt: [
          transcript,
          '',
          '[زر سريع: عدّل مرفق]',
          'نفّذ على مرفق تيليجرام الأخير (fileId) أو خزنة الغرفة — edit/convert ثم return_file.',
          'ممنوع طلب إعادة الإرسال إن وُجدت بايتات. رد موجز.',
        ].join('\n'),
      }
    case 'doc':
      return {
        labelAr: 'مستند جاهز',
        forceHeavy: true,
        prompt: [
          transcript,
          '',
          '[زر سريع: مستند جاهز — مسار صوت→ملف]',
          'المسار الإلزامي:',
          '1) استخدم التفريغ أعلاه كمحتوى.',
          '2) أنشئ ملفاً جديداً: write_file (نص/md) أو pdf_create — أو brain_create_document إن طُلب Drive مباشرة.',
          '3) أرجع الناتج فوراً بـ return_file للمجموعة.',
          '4) اختياري بعد التسليم: أرشفة Drive عبر brain_save_document — لا تؤرشف قبل return_file.',
          'ممنوع البحث في Drive أولاً. ممنوع طلب إعادة الإرسال. رد موجز: اسم الملف + أنه أُرسل.',
        ].join('\n'),
      }
    case 'mail':
      return {
        labelAr: 'بريد',
        forceHeavy: true,
        prompt: [
          transcript,
          '',
          '[زر سريع: بريد]',
          'نفّذ عبر mail_search/mail_read/mail_send (صندوق الجمعية) أو gmail_* إن لزم.',
          'لخّص النتائج بالعربية — لا تختلق رسائل.',
        ].join('\n'),
      }
    case 'message':
      return {
        labelAr: 'رسالة / تبليغ',
        forceHeavy: false,
        prompt: [
          transcript,
          '',
          '[زر سريع: لعضو]',
          'استخرج اسم المستلم ونص الرسالة.',
          'نفّذ عبر notify_room_member فوراً.',
          'اشرح إن وصلت خاصاً أو نُشرت في المجموعة، وحدود Start للبوت.',
        ].join('\n'),
      }
    case 'broadcast':
      return {
        labelAr: 'تنبيه مجموعة',
        forceHeavy: false,
        prompt: [
          transcript,
          '',
          '[زر سريع: للمجموعة]',
          'انشر النص للجميع عبر notify_room_member مع targetNameAr=المجموعة.',
          'لخّص ما أُرسل.',
        ].join('\n'),
      }
    case 'wake':
      return {
        labelAr: 'إيقاظ وكيل',
        forceHeavy: true,
        prompt: [
          transcript,
          '',
          '[زر سريع: أيقظ وكيل]',
          'أيقظ وكيل١ (ثم ٢ عند الانشغال) ونفّذ الطلب بأدوات الغرفة الكاملة مثل الموقع.',
          'لخّص ما نُفّذ والمرفقات إن وُجدت.',
        ].join('\n'),
      }
  }
}

export function formatVoiceSttSummaryAr(opts: {
  transcript: string
  intentLabelAr: string
  providerLabelAr: string
}): string {
  const raw = opts.transcript.trim()
  const short =
    raw.length > 280 ? `${raw.slice(0, 277).trimEnd()}…` : raw
  return [
    '🎤 فهمت:',
    `«${short}»`,
    '',
    `القصد: ${opts.intentLabelAr} · ${opts.providerLabelAr}`,
    'جاري التنفيذ الآن — أو اختر زراً لتوجيه القصد:',
  ].join('\n')
}

export const VOICE_QUICK_HINT_AR =
  'أزرار سريعة (اختياري) — التنفيذ بدأ تلقائياً:'
