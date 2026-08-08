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

/** Agent / tool output that means we should break silence with a short note. */
export function looksLikeUnknownOrNotFound(text: string): boolean {
  const t = String(text || '').trim()
  // Empty success (tools ran, no chatty reply) must stay silent — not «ما عرفت».
  if (!t) return false
  return (
    /ما\s*عرف(?:ت|نا)?|ما\s*عرفت|لم\s*أعر[ف]|لا\s*أعرف|ما\s*حصلت|لم\s*أحص[ل]|لم\s*أجد|ما\s*لقيت|غير\s*موجود|لا\s*يوجد|تعذ[ّر]ر?\s*العثور|لم\s*يُعثر|ما\s*لقيت|not\s*found|couldn'?t\s*find|i\s*don'?t\s*know/i.test(
      t
    )
  )
}

/** Short Arabic failure note for the group (no long agent essay). */
export function formatUnknownShortAr(raw?: string): string {
  const t = String(raw || '').trim()
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
