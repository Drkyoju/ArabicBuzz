/**
 * «المعلم الاول» short-name → Prophetic biography (السيرة), NEVER biology guide.
 */
export const MUALLIM_SEERAH_FULL_HINT =
  'المعلم الأول من معالم من السيرة النبوية'

const NORM_TATWEEL = /\u0640/g

export function normalizeArabicFilename(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(NORM_TATWEEL, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

/** Biology teacher-guide / أحياء — hard reject as substitute. */
export function isBiologyTeacherGuideName(name: string): boolean {
  const n = normalizeArabicFilename(name)
  return (
    /احياء/.test(n) ||
    /biology/.test(n) ||
    /دليل\s*معلم\s*الاحياء/.test(n) ||
    /معلم\s*الاحياء/.test(n)
  )
}

/**
 * True when filename is the seerah «المعلم الأول» work (short or full title).
 * Accepts abbreviation «المعلم الاول» and full «…من معالم…السيرة…».
 */
export function matchMuallimSeerahFile(name: string): boolean {
  if (!name?.trim()) return false
  if (isBiologyTeacherGuideName(name)) return false
  const n = normalizeArabicFilename(name)
  const hasMuallimAwwal =
    /المعلم\s*الاول/.test(n) || /معلم\s*اول/.test(n)
  if (!hasMuallimAwwal) return false
  // Full title cues — preferred
  if (/السيره|معالم/.test(n)) return true
  // Short name alone is OK if not biology (already excluded)
  // Reject if clearly another subject textbook without seerah cues AND has دليل
  if (/دليل/.test(n) && !/السيره|معالم|نبويه/.test(n)) return false
  return true
}

/**
 * Score candidates for short-name «المعلم الاول».
 * Higher = better. Biology always -Infinity.
 */
export function scoreMuallimSeerahCandidate(
  name: string,
  query?: string
): number {
  if (isBiologyTeacherGuideName(name)) return Number.NEGATIVE_INFINITY
  if (!matchMuallimSeerahFile(name)) return Number.NEGATIVE_INFINITY
  const n = normalizeArabicFilename(name)
  let score = 10
  if (/السيره/.test(n)) score += 50
  if (/معالم/.test(n)) score += 40
  if (/نبويه/.test(n)) score += 20
  if (/المعلم\s*الاول/.test(n)) score += 15
  const q = query ? normalizeArabicFilename(query) : ''
  if (q && n.includes(q.replace(/\.pdf$/, ''))) score += 5
  return score
}

/**
 * Pick best seerah «المعلم الأول» file from a list; never biology.
 */
export function pickMuallimSeerahFile<
  T extends { id: string; originalName: string },
>(
  files: T[],
  query?: string
): T | null {
  let best: T | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const f of files) {
    const s = scoreMuallimSeerahCandidate(f.originalName, query)
    if (s > bestScore) {
      bestScore = s
      best = f
    }
  }
  return bestScore > 0 ? best : null
}

/** Does this user/job expected name refer to the seerah short title? */
export function isMuallimSeerahShortQuery(q: string): boolean {
  const n = normalizeArabicFilename(q || '')
  if (isBiologyTeacherGuideName(q)) return false
  return /المعلم\s*الاول/.test(n) || /^معلم\s*اول/.test(n)
}
