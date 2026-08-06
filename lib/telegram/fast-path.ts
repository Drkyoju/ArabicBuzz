/**
 * Heuristic fast paths for Telegram — skip the full multi-tool agent when
 * the ask is a greeting or a simple room count (calendar / tasks).
 */

import { listRoomCalendarEvents } from '@/lib/rooms/room-calendar'
import { listRoomTasks } from '@/lib/rooms/room-tasks'

export type TelegramFastPathKind =
  | 'greeting'
  | 'calendar_count'
  | 'tasks_count'
  | null

const GREETING_RE =
  /^(السلام\s*عليكم|سلام\s*عليكم|مرحبا|مرحباً|أهلا|اهلا|هلا|هاي|hi|hello|صباح\s*الخير|مساء\s*الخير|كيف\s*الحال|كيفك|وش\s*أخبارك|وش\s*اخبارك)[\s!.؟?…]*$/iu

const THANKS_RE = /^(شكرا|شكراً|مشكور|تسلم|يعطيك\s*العافية)[\s!.؟?…]*$/iu

const CALENDAR_COUNT_RE =
  /(?:كم|عدد)\s*(?:ال)?(?:موعد|مواعيد|أحداث|احداث|فعاليات)|(?:ما|وش)\s*(?:عدد|كم)\s*(?:ال)?(?:مواعيد|أحداث)|تقويم\s*(?:الغرفة|الفريق)?\s*(?:كم|فارغ|فيه\s*كم)|كم\s*(?:عندنا|فيه)\s*(?:موعد|مواعيد)/iu

const TASKS_COUNT_RE =
  /(?:كم|عدد)\s*(?:ال)?(?:مهام|مهمة|تاسكات|tasks?)|(?:ما|وش)\s*(?:عدد|كم)\s*(?:ال)?(?:مهام)|كم\s*(?:عندنا|فيه)\s*(?:مهمة|مهام)/iu

/** Heavy work that should keep a fuller toolset + stronger model. */
const HEAVY_WORK_RE =
  /(?:عدّل|عدل|عدلي|عدّلي|أنشئ|انشئ|اكتب|أكتب|حرّر|حرر|استبدل|احذف|امسح|ارفع|لخّص|لخص|حوّل|pdf|docx|xlsx|word|excel|باور|ملف|مستند|قرار|محضر|drive|drive_sync|ocr)/iu

export function classifyTelegramFastPath(raw: string): TelegramFastPathKind {
  const t = raw.trim()
  if (!t || t.length > 120) return null
  if (GREETING_RE.test(t) || THANKS_RE.test(t)) return 'greeting'
  if (CALENDAR_COUNT_RE.test(t) && !HEAVY_WORK_RE.test(t)) return 'calendar_count'
  if (TASKS_COUNT_RE.test(t) && !HEAVY_WORK_RE.test(t)) return 'tasks_count'
  return null
}

export function isHeavyTelegramPrompt(raw: string): boolean {
  const t = raw.trim()
  if (t.length > 280) return true
  return HEAVY_WORK_RE.test(t)
}

/** Dialect markers that may need a cheap rewrite; MSA/short asks skip it. */
const DIALECT_HINT_RE =
  /\b(?:وش|ايش|ليش|ابي|أبغى|ابغى|يبغى|تبي|كذا|هيك|يعني|الحين|دحين|وشلون|شلون|عطني|قلي|قولي|مابي|مب)\b/iu

export function shouldNormalizeTelegramDialect(raw: string): boolean {
  if (process.env.TELEGRAM_DIALECT_NORMALIZE === '1') return true
  if (process.env.TELEGRAM_DIALECT_NORMALIZE === '0') return false
  const t = raw.trim()
  if (t.length < 12) return false
  if (classifyTelegramFastPath(t)) return false
  return DIALECT_HINT_RE.test(t) && t.length >= 12
}

export async function runTelegramFastPath(opts: {
  kind: NonNullable<TelegramFastPathKind>
  scopeId: string
  userFirstName?: string
  rawPrompt?: string
}): Promise<string> {
  if (opts.kind === 'greeting') {
    const raw = (opts.rawPrompt || '').trim()
    if (THANKS_RE.test(raw)) {
      return 'العفو — تحت أمرك لأي مهمة في الغرفة.'
    }
    const name = opts.userFirstName?.trim()
    const tail = name
      ? `${name} — تفضّل، كيف أقدر أساعدك في غرفة العمل؟`
      : 'تفضّل، كيف أقدر أساعدك في غرفة العمل؟'
    return `أهلاً ${tail}`
  }

  if (opts.kind === 'calendar_count') {
    const events = await listRoomCalendarEvents({ scopeId: opts.scopeId })
    if (events.length === 0) {
      return 'تقويم الغرفة فارغ حالياً — لا مواعيد مشتركة مسجّلة.'
    }
    const upcoming = events
      .filter((e) => e.status !== 'cancelled')
      .slice(0, 5)
      .map((e) => `• ${e.titleAr}`)
      .join('\n')
    return [
      `تقويم الغرفة: ${events.length} موعداً مشتركاً.`,
      upcoming ? `\nأقرب العناوين:\n${upcoming}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  const tasks = await listRoomTasks(opts.scopeId)
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
  if (open.length === 0) {
    return 'لا مهام مفتوحة حالياً في لوحة الغرفة.'
  }
  const sample = open
    .slice(0, 5)
    .map((t) => `• ${t.titleAr}`)
    .join('\n')
  return [`مهام الغرفة المفتوحة: ${open.length}.`, sample ? `\n${sample}` : '']
    .filter(Boolean)
    .join('\n')
}
