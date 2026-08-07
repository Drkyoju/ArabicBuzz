/**
 * Heuristic fast paths for Telegram — skip the full multi-tool agent when
 * the ask is a greeting or a simple room count/list (calendar / tasks).
 * Calendar answers use Asia/Riyadh only (no UTC in user-facing text).
 */

import { listRoomCalendarEvents } from '@/lib/rooms/room-calendar'

export type TelegramFastPathKind =
  | 'greeting'
  | 'calendar_count'
  | 'tasks_count'
  | null

const TZ = 'Asia/Riyadh'

const GREETING_RE =
  /^(السلام\s*عليكم|سلام\s*عليكم|مرحبا|مرحباً|أهلا|اهلا|هلا|هاي|hi|hello|صباح\s*الخير|مساء\s*الخير|كيف\s*الحال|كيفك|وش\s*أخبارك|وش\s*اخبارك)[\s!.؟?…]*$/iu

const THANKS_RE = /^(شكرا|شكراً|مشكور|تسلم|يعطيك\s*العافية)[\s!.؟?…]*$/iu

const CALENDAR_COUNT_RE =
  /(?:كم|عدد)\s*(?:ال)?(?:موعد|مواعيد|أحداث|احداث|فعاليات)|(?:ما|وش)\s*(?:عدد|كم)\s*(?:ال)?(?:مواعيد|أحداث)|تقويم\s*(?:الغرفة|الفريق)?\s*(?:كم|فارغ|فيه\s*كم)|كم\s*(?:عندنا|فيه)\s*(?:موعد|مواعيد)|(?:مواعيد|موعد|أحداث|احداث)\s*(?:ال)?(?:يوم|اليوم|الليلة)|(?:وش|شو|ماذا|ما)\s*(?:عندنا|فيه)\s*(?:اليوم|الليلة)|مواعيد\s*اليوم|أجندة\s*(?:اليوم|الغرفة)?/iu

const TASKS_COUNT_RE =
  /(?:كم|عدد)\s*(?:ال)?(?:مهام|مهمة|تاسكات|tasks?)|(?:ما|وش)\s*(?:عدد|كم)\s*(?:ال)?(?:مهام)|كم\s*(?:عندنا|فيه)\s*(?:مهمة|مهام)/iu

/** Heavy work that should keep a fuller toolset + stronger model. */
const HEAVY_WORK_RE =
  /(?:عدّل|عدل|عدلي|عدّلي|أنشئ|انشئ|اكتب|أكتب|حرّر|حرر|استبدل|احذف|امسح|ارفع|لخّص|لخص|حوّل|pdf|docx|xlsx|word|excel|باور|ملف|مستند|قرار|محضر|drive|drive_sync|ocr|لائح|عقد|درايف|بريد|إيميل|ايميل|email|gmail)/iu

const TODAY_HINT_RE = /(?:اليوم|الليلة|هذا\s*اليوم|لهالיום)/iu

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

function riyadhYmd(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Inclusive day bounds in Asia/Riyadh (UTC+3, no DST). */
export function riyadhDayBoundsIso(ymd?: string): { from: string; to: string } {
  const day = ymd || riyadhYmd()
  return {
    from: new Date(`${day}T00:00:00+03:00`).toISOString(),
    to: new Date(`${day}T23:59:59.999+03:00`).toISOString(),
  }
}

export function formatRiyadhTimeRange(
  startsAt: string,
  endsAt: string,
  allDay?: boolean
): string {
  if (allDay) return 'طوال اليوم'
  try {
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }
    const s = new Date(startsAt).toLocaleTimeString('ar-SA', opts)
    const e = new Date(endsAt).toLocaleTimeString('ar-SA', opts)
    return `${s}–${e}`
  } catch {
    return ''
  }
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
    const raw = (opts.rawPrompt || '').trim()
    const todayOnly = TODAY_HINT_RE.test(raw)
    const bounds = todayOnly ? riyadhDayBoundsIso() : undefined
    const events = await listRoomCalendarEvents({
      scopeId: opts.scopeId,
      from: bounds?.from,
      to: bounds?.to,
      hideTestTitles: true,
    })
    const active = events.filter((e) => e.status !== 'cancelled')
    if (active.length === 0) {
      return todayOnly
        ? 'لا مواعيد مشتركة اليوم في تقويم الغرفة (توقيت السعودية).'
        : 'تقويم الغرفة فارغ حالياً — لا مواعيد مشتركة مسجّلة.'
    }
    const lines = active.slice(0, 8).map((e) => {
      const when = formatRiyadhTimeRange(e.startsAt, e.endsAt, e.allDay)
      return when ? `• ${when} — ${e.titleAr}` : `• ${e.titleAr}`
    })
    const head = todayOnly
      ? `مواعيد اليوم: ${active.length} (توقيت السعودية).`
      : `تقويم الغرفة: ${active.length} موعداً مشتركاً (توقيت السعودية).`
    return [head, '', ...lines].join('\n')
  }

  const { listRoomTasks } = await import('@/lib/rooms/room-tasks')
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
