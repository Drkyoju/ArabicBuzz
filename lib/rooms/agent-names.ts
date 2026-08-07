/**
 * Agent display names: default seat labels (وكيل١…), personal aliases,
 * and shared-room names editable only by the workspace owner.
 */

import { isWorkspaceOwnerEmail } from '@/lib/auth/roles'
import { usesSharedRoomRoster } from '@/lib/rooms/roster-scope'
import type { AgentRosterPayload } from '@/lib/rooms/roster-types'
import type { RoomAgent } from '@/lib/rooms/agents'

const EASTERN_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** Convert Western digits in a number/string to Eastern Arabic digits. */
export function toEasternDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => EASTERN_DIGITS[Number(d)] ?? d)
}

/** Default seat label: وكيل١، وكيل٢، وكيل٣… */
export function defaultSeatNameAr(index1Based: number): string {
  const n = Math.max(1, Math.floor(index1Based) || 1)
  return `وكيل${toEasternDigits(n)}`
}

/** True when this room’s agent display names are fixed for all members. */
export function sharedAgentNamesAreFixed(scopeId: string): boolean {
  return usesSharedRoomRoster(scopeId)
}

/**
 * Who may edit shared-room agent display names (nameAr / slug).
 * Personal desks: any signed-in user for their own roster.
 * Shared team room: workspace owner only (ryodan71@gmail.com).
 */
export function canEditAgentDisplayName(opts: {
  scopeId: string
  email?: string | null
}): boolean {
  if (!sharedAgentNamesAreFixed(opts.scopeId)) return true
  return isWorkspaceOwnerEmail(opts.email)
}

/** Arabic hint for rename UI. */
export function agentRenameHintAr(scopeId: string, canEdit: boolean): string {
  if (!sharedAgentNamesAreFixed(scopeId)) {
    return 'في مساحتي الشخصية يمكنك إعادة تسمية أي وكيل — الأسماء خاصة بك.'
  }
  if (canEdit) {
    return 'غرفة الفريق المشتركة: أنت المدير — أسماء الوكلاء هنا ثابتة لكل الموظفين بعد الحفظ.'
  }
  return 'غرفة الفريق المشتركة: أسماء الوكلاء ثابتة ويحدّدها المدير فقط.'
}

/**
 * When a non-owner saves a shared roster, keep existing display names/slugs
 * so client overrides cannot rewrite manager names.
 */
export function preserveSharedDisplayNames(
  existing: AgentRosterPayload,
  incoming: AgentRosterPayload
): AgentRosterPayload {
  const prevCustom = new Map(
    (existing.customAgents || []).map((a) => [a.id, a])
  )
  const prevOverrides = existing.agentOverrides || {}

  const customAgents = (incoming.customAgents || []).map((a) => {
    const prev = prevCustom.get(a.id)
    if (!prev) return a
    return {
      ...a,
      nameAr: prev.nameAr,
      slug: prev.slug,
    }
  })

  const agentOverrides: AgentRosterPayload['agentOverrides'] = {}
  for (const [id, patch] of Object.entries(incoming.agentOverrides || {})) {
    const prev = prevOverrides[id]
    const { nameAr: _dropName, slug: _dropSlug, ...rest } = patch
    agentOverrides[id] = {
      ...rest,
      ...(prev?.nameAr ? { nameAr: prev.nameAr } : {}),
      ...(prev?.slug ? { slug: prev.slug } : {}),
    }
  }
  // Keep any prior name-only overrides the client omitted
  for (const [id, prev] of Object.entries(prevOverrides)) {
    if (agentOverrides[id]) continue
    if (prev.nameAr || prev.slug) {
      agentOverrides[id] = { ...prev }
    }
  }

  return {
    ...incoming,
    customAgents,
    agentOverrides,
  }
}

/** Apply seat-index default names when agents still use empty/placeholder labels. */
export function withSeatDefaultNames(agents: RoomAgent[]): RoomAgent[] {
  return agents.map((a, i) => {
    const trimmed = a.nameAr?.trim()
    if (trimmed) return a
    return { ...a, nameAr: defaultSeatNameAr(i + 1) }
  })
}
