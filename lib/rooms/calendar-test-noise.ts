/**
 * Detect / soft-cancel test calendar events that clutter the team agenda.
 * Titles like «اختبار تقويم الفريق» are QA leftovers, not real meetings.
 */

const TEST_TITLE_PATTERNS: RegExp[] = [
  /^اختبار[\s·\-–—]/,
  /اختبار\s*تقويم/,
  /اختبار\s*بدون\s*موافقة/,
  /اختبار\s*الموافقة/,
  /test\s*(calendar|event|meeting)/i,
  /^qa[\s\-]/i,
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
