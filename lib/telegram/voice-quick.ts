/**
 * Inline quick-actions after Telegram voice STT:
 * أضِف موعد · مهمة · ابحث عن الملف
 */
import { InlineKeyboard } from 'grammy'

export type VoiceQuickAction = 'appointment' | 'task' | 'file'

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
} as const

export function parseVoiceQuickCallback(
  data: string
): VoiceQuickAction | null {
  if (data === VOICE_QUICK_PREFIX.appointment) return 'appointment'
  if (data === VOICE_QUICK_PREFIX.task) return 'task'
  if (data === VOICE_QUICK_PREFIX.file) return 'file'
  return null
}

export function buildVoiceQuickKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('أضِف موعد', VOICE_QUICK_PREFIX.appointment)
    .text('مهمة', VOICE_QUICK_PREFIX.task)
    .row()
    .text('ابحث عن الملف', VOICE_QUICK_PREFIX.file)
}

export function voiceQuickPrompt(
  action: VoiceQuickAction,
  transcript: string
): { prompt: string; labelAr: string; forceHeavy: boolean } {
  switch (action) {
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
  }
}

export const VOICE_QUICK_HINT_AR =
  'اختر إجراءً سريعاً على النص المفرَّغ، أو اكتب طلبك مباشرة:'
