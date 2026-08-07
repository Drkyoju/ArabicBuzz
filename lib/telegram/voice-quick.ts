/**
 * Inline quick-actions after Telegram voice STT.
 */
import { InlineKeyboard } from 'grammy'

export type VoiceQuickAction =
  | 'appointment'
  | 'task'
  | 'file'
  | 'message'
  | 'broadcast'
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
  message: 'vq_msg',
  broadcast: 'vq_cast',
  run: 'vq_run',
} as const

export function parseVoiceQuickCallback(
  data: string
): VoiceQuickAction | null {
  if (data === VOICE_QUICK_PREFIX.appointment) return 'appointment'
  if (data === VOICE_QUICK_PREFIX.task) return 'task'
  if (data === VOICE_QUICK_PREFIX.file) return 'file'
  if (data === VOICE_QUICK_PREFIX.message) return 'message'
  if (data === VOICE_QUICK_PREFIX.broadcast) return 'broadcast'
  if (data === VOICE_QUICK_PREFIX.run) return 'run'
  return null
}

export function buildVoiceQuickKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ نفّذ الآن', VOICE_QUICK_PREFIX.run)
    .text('أضِف موعد', VOICE_QUICK_PREFIX.appointment)
    .row()
    .text('مهمة', VOICE_QUICK_PREFIX.task)
    .text('ابحث عن الملف', VOICE_QUICK_PREFIX.file)
    .row()
    .text('أرسل لعضو', VOICE_QUICK_PREFIX.message)
    .text('بلّغ المجموعة', VOICE_QUICK_PREFIX.broadcast)
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
          '[زر سريع: نفّذ الآن]',
          'نفّذ الطلب بالكامل بأدوات غرفة الموقع (تقويم/مهام/ملفات/Drive/تبليغ) وأعد ملخصاً واضحاً مع المرفقات.',
        ].join('\n'),
      }
    case 'appointment':
      return {
        labelAr: 'موعد',
        forceHeavy: false,
        prompt: [
          transcript,
          '',
          '[زر سريع: أضِف موعد]',
          'استخرج العنوان والتاريخ/الوقت (Asia/Riyadh) وأنشئ عبر room_calendar_create فوراً.',
          'أكّد بالعربية: العنوان · الوقت · أنه في تقويم الغرفة.',
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
        labelAr: 'ملف',
        forceHeavy: true,
        prompt: [
          transcript,
          '',
          '[زر سريع: ابحث عن الملف]',
          'ابحث في خزنة الغرفة و/أو عقل الشركة (Drive إن مربوط) وأعد الملف أو ملخصاً قصيراً.',
          'استخدم list_workspace_files / search_knowledge_base / brain_open_document ثم return_file عند الحاجة.',
        ].join('\n'),
      }
    case 'message':
      return {
        labelAr: 'رسالة / تبليغ',
        forceHeavy: false,
        prompt: [
          transcript,
          '',
          '[زر سريع: أرسل لعضو]',
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
          '[زر سريع: بلّغ المجموعة]',
          'انشر النص للجميع عبر notify_room_member مع targetNameAr=المجموعة.',
          'لخّص ما أُرسل.',
        ].join('\n'),
      }
  }
}

export function formatVoiceSttSummaryAr(opts: {
  transcript: string
  intentLabelAr: string
  providerLabelAr: string
}): string {
  const t = opts.transcript.trim().slice(0, 3200)
  return [
    '🎤 تفريغ الصوت',
    `المحرك: ${opts.providerLabelAr}`,
    `القصد المقترح: ${opts.intentLabelAr}`,
    '',
    '«' + t + '»',
    '',
    'راجع النص أعلاه. إن كان صحيحاً سيُنفَّذ تلقائياً، أو اختر زراً سريعاً:',
  ].join('\n')
}

export const VOICE_QUICK_HINT_AR =
  'أزرار سريعة — أو اكتب تصحيحاً/طلباً جديداً:'
