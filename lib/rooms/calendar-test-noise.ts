/**
 * Detect / soft-cancel test calendar events that clutter the team agenda.
 * Keep patterns narrow — only clear obvious QA leftovers, not real meetings
 * whose titles happen to mention «اختبار» in passing.
 */

const TEST_TITLE_PATTERNS: RegExp[] = [
  /^اختبار\s*تقويم/,
  /^اختبار\s*دخان/,
  /^اختبار\s*بدون\s*موافقة/,
  /^اختبار\s*الموافقة/,
  /^اختبار\s*موعد(\s|$)/,
  /^qa[\s\-·–—]/i,
  /^test[\s\-·–—]*(calendar|event|meeting)/i,
  /^smoke[\s\-·–—]*(calendar|event|test)/i,
]

export function isTestCalendarTitle(titleAr: string | null | undefined): boolean {
  const t = (titleAr || '').normalize('NFC').trim()
  if (!t) return false
  return TEST_TITLE_PATTERNS.some((re) => re.test(t))
}

export function filterOutTestCalendarEvents<T extends { titleAr: string }>(
  events: T[]
): T[] {
  return events.filter((e) => !isTestCalendarTitle(e.titleAr))
}
