/**
 * Linked Telegram group reply policy (product):
 * - Always ingest + analyze every delivered update.
 * - Execute actionable work immediately (even without @mention).
 * - Visible group replies ONLY when:
 *   (a) bot is @mentioned / reply-to-bot / commands → full reply
 *   (b) unknown / not-found after a task → short «ما عرفت / ما حصلت»
 * - Casual chat: silent (no spam).
 * - Never delete Telegram messages.
 */

export type TelegramGroupReplyMode = 'full' | 'silent_execute'

export function resolveGroupReplyMode(opts: {
  inGroup: boolean
  mentioned: boolean
  isReplyToBot: boolean
  isCommand?: boolean
}): TelegramGroupReplyMode {
  if (!opts.inGroup) return 'full'
  if (opts.isCommand || opts.mentioned || opts.isReplyToBot) return 'full'
  return 'silent_execute'
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
