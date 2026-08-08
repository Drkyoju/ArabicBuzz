/**
 * Per-user private desk («مساحتي الشخصية»).
 * Content is scoped to personal-u-{userId} — never the shared team room.
 */

/** Legacy shared bucket — do not use for new writes; redirect clients away. */
export const LEGACY_PERSONAL_DESK_SCOPE_ID = 'personal-demo'
export const LEGACY_PERSONAL_RESEARCH_SCOPE_ID = 'personal-research'

const LEGACY_OPEN_PERSONAL = new Set([
  LEGACY_PERSONAL_DESK_SCOPE_ID,
  LEGACY_PERSONAL_RESEARCH_SCOPE_ID,
])

/** Stable private scope id for a signed-in user. */
export function personalDeskScopeId(userId: string): string {
  const id = String(userId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
  if (!id || id === 'local-owner') {
    return LEGACY_PERSONAL_DESK_SCOPE_ID
  }
  return `personal-u-${id}`
}

export function isPersonalScopeId(scopeId: string): boolean {
  return Boolean(scopeId) && scopeId.startsWith('personal-')
}

export function isLegacySharedPersonalScope(scopeId: string): boolean {
  return LEGACY_OPEN_PERSONAL.has(scopeId)
}

/** True when this scope is the caller's private desk (or they own a personal-* id). */
export function ownsPersonalScope(scopeId: string, userId: string): boolean {
  if (!scopeId || !userId || userId === 'local-owner') return false
  if (isLegacySharedPersonalScope(scopeId)) return false
  const safe = String(userId)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safe) return false
  if (scopeId === `personal-u-${safe}`) return true
  // Extra private sessions under the same user prefix
  if (scopeId.startsWith(`personal-u-${safe}-`)) return true
  return false
}

/** Canonical product desk for sidebar pin + redirects. */
export function isPinnedPersonalDesk(
  scopeId: string,
  userId?: string | null
): boolean {
  if (!scopeId) return false
  if (userId && scopeId === personalDeskScopeId(userId)) return true
  return scopeId === LEGACY_PERSONAL_DESK_SCOPE_ID
}

export const PERSONAL_DESK_COPY = {
  nameAr: 'مساحتي الشخصية',
  taglineAr: 'خاصة بك وحدك',
  descriptionAr:
    'مساحتي الشخصية — خاصة بك وحدك. الرسائل والملفات وتشغيل الوكلاء والمسودات لا تظهر لغرفة الفريق ولا لأعضاء آخرين.',
  sidebarHintAr: 'خاصة بك وحدك — غير مرئية للفريق',
  mailOrgVsPersonalAr:
    'بريد الجمعية (info@…) مشترك للمؤسسة من الشريط الجانبي. «بريدي الشخصي» يربط Gmail الخاص بك فقط — الوارد والبحث والردود تبقى لك وحدك.',
} as const
