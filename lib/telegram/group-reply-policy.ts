/**
 * Linked Telegram group reply policy (product):
 * - Always ingest + analyze every delivered update.
 * - Intent detection replaces @mention as the gate.
 * - If the message is a request the bot can fulfill → execute FAST + reply with result
 *   (text, voice, files — mention optional).
 * - If clearly people chatting / not for the bot → silent watch (media still imports).
 * - @mention / reply-to-bot / commands still force a full visible reply.
 * - Never delete Telegram messages.
 */

export type TelegramGroupReplyMode = 'full' | 'silent_execute'

export function resolveGroupReplyMode(opts: {
  inGroup: boolean
  mentioned: boolean
  isReplyToBot: boolean
  isCommand?: boolean
  /** From classifyTelegramWorkIntent — drives no-mention auto-reply. */
  workKind?: string
}): TelegramGroupReplyMode {
  if (!opts.inGroup) return 'full'
  if (opts.isCommand || opts.mentioned || opts.isReplyToBot) return 'full'
  // Intent wins over mention: any actionable work → act + reply with result.
  if (opts.workKind && opts.workKind !== 'casual') return 'full'
  // People chatting / greetings / unclear social → stay silent.
  return 'silent_execute'
}

/** True when the bot should speak results in the group (not only watch). */
export function shouldReplyWithTelegramResult(opts: {
  inGroup: boolean
  mentioned: boolean
  isReplyToBot: boolean
  isCommand?: boolean
  workKind?: string
}): boolean {
  return resolveGroupReplyMode(opts) === 'full'
}

/** Agent output already includes the blocked-task research template. */
export function looksLikeBlockedTaskReply(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  return /تعذ[ّر]ر?\s*تنفيذ\s*المهمة|أقترح\s*\(من\s*الأرخص\)|إن\s*وفّرت\s*مفتاح|بوابة\s*الدفع/i.test(
    t
  )
}

/** Free-execute instruction returned without attachments — still need auto-run. */
export function looksLikeFreeExecuteInstruction(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  return /وُجد مسار مجاني قابل للتنفيذ|canExecuteFree|نفّذ الآن بدون سؤال/i.test(
    t
  )
}

/** Agent / tool output that means we should break silence (unknown or capability gap). */
export function looksLikeUnknownOrNotFound(text: string): boolean {
  const t = String(text || '').trim()
  // Empty success (tools ran, no chatty reply) must stay silent — not «ما عرفت».
  if (!t) return false
  if (looksLikeBlockedTaskReply(t)) return true
  if (looksLikeFreeExecuteInstruction(t)) return true
  return (
    /ما\s*عرف(?:ت|نا)?|ما\s*عرفت|لم\s*أعر[ف]|لا\s*أعرف|ما\s*حصلت|لم\s*أحص[ل]|لم\s*أجد|ما\s*لقيت|غير\s*موجود|لا\s*يوجد|تعذ[ّر]ر?\s*العثور|تعذ[ّر]ر?\s*التنفيذ|لا\s*أستطيع|غير\s*مدعوم|أدواتي\s*الحالية|لم\s*يُعثر|ما\s*لقيت|not\s*found|couldn'?t\s*find|i\s*don'?t\s*know|cannot\s*(complete|do)|unable\s*to|no\s*tool/i.test(
      t
    )
  )
}

/**
 * Short Arabic failure note for the group.
 * If the agent already researched a capability gap, keep that fuller MSA reply.
 */
export function formatUnknownShortAr(raw?: string): string {
  const t = String(raw || '').trim()
  if (looksLikeBlockedTaskReply(t)) {
    return t.slice(0, 3500)
  }
  if (/ما\s*حصلت|لم\s*أحص[ل]|لم\s*أجد|ما\s*لقيت|غير\s*موجود|لا\s*يوجد|not\s*found/i.test(t)) {
    return 'ما حصلت هذا.'
  }
  if (/ما\s*عرف|لم\s*أعر[ف]|لا\s*أعرف|i\s*don'?t\s*know/i.test(t)) {
    return 'ما عرفت كذا.'
  }
  if (!t) return 'ما عرفت كذا.'
  // Prefer the shorter of the two stock lines based on content cues.
  if (/ملف|مستند|لائحة|بحث|عث[ر]/i.test(t)) return 'ما حصلت هذا.'
  return 'ما عرفت كذا.'
}

export function isCasualTelegramWork(kind: string): boolean {
  return kind === 'casual'
}
