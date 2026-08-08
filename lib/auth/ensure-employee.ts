import {
  getEmployeeEmails,
  isWorkspaceOwnerEmail,
  normalizeEmail,
} from '@/lib/auth/roles'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'
import {
  addRoomMember,
  listRoomMembers,
  updateRoomMember,
} from '@/lib/rooms/persist'

/** Process-local guard so allowlist seed runs once per warm instance. */
let allowlistSeeded = false

function labelFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim()
  return local || 'موظف'
}

/**
 * Idempotent upsert of a MEMBER row in the primary team room.
 * Links `userId` when the signed-in user matches; never elevates to owner.
 */
export async function ensurePrimaryRoomEmployeeMembership(opts: {
  email: string
  userId?: string | null
  displayNameAr?: string | null
}): Promise<{ ok: boolean; created?: boolean; error?: string }> {
  const email = normalizeEmail(opts.email)
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'بريد غير صالح' }
  }
  if (isWorkspaceOwnerEmail(email)) {
    return { ok: true, created: false }
  }

  const scopeId = PRIMARY_TEAM_SCOPE_ID
  const preferredName = String(opts.displayNameAr || '').trim()
  const name = preferredName || labelFromEmail(email)
  const { members } = await listRoomMembers(scopeId)
  const existing = members.find(
    (m) => m.email && normalizeEmail(m.email) === email
  )

  if (existing) {
    const needsUser =
      Boolean(opts.userId) && existing.userId !== opts.userId
    const placeholder =
      !existing.displayNameAr ||
      existing.displayNameAr === labelFromEmail(email) ||
      existing.displayNameAr.includes('@')
    const needsName = Boolean(preferredName) && placeholder
    const needsRole = existing.role === 'owner' || existing.role === 'editor'

    if (!needsUser && !needsName && !needsRole) {
      return { ok: true, created: false }
    }

    const updated = await updateRoomMember({
      scopeId,
      memberId: existing.id,
      role: 'member',
      ...(needsName ? { displayNameAr: name } : {}),
      ...(needsUser ? { userId: opts.userId || null } : {}),
    })
    return updated.ok
      ? { ok: true, created: false }
      : { ok: false, error: updated.error }
  }

  const added = await addRoomMember({
    scopeId,
    displayNameAr: name,
    email,
    userId: opts.userId || null,
    role: 'member',
  })
  if (!added.ok) {
    if (added.error?.includes('موجود')) {
      return { ok: true, created: false }
    }
    return { ok: false, error: added.error }
  }
  return { ok: true, created: true }
}

/**
 * Seed allowlisted employee emails into غرفة الفريق so they appear in the
 * roster before first Google sign-in (no passwords — OAuth only).
 */
export async function ensureAllowlistedEmployeesSeeded(): Promise<void> {
  if (allowlistSeeded) return
  allowlistSeeded = true
  for (const email of getEmployeeEmails()) {
    try {
      await ensurePrimaryRoomEmployeeMembership({ email })
    } catch {
      /* non-fatal — room table may be unavailable */
    }
  }
}

/**
 * After Google / OTP login: org role stays MEMBER for non-owners; join the
 * primary team room and seed the employee allowlist into the roster.
 */
export async function ensureSignedInEmployeeProvisioned(opts: {
  userId: string
  email: string | null | undefined
  displayNameAr?: string | null
}): Promise<void> {
  const email = normalizeEmail(opts.email)
  if (!email || isWorkspaceOwnerEmail(email)) {
    try {
      await ensureAllowlistedEmployeesSeeded()
    } catch {
      /* non-fatal */
    }
    return
  }

  try {
    await ensureAllowlistedEmployeesSeeded()
    await ensurePrimaryRoomEmployeeMembership({
      email,
      userId: opts.userId,
      displayNameAr: opts.displayNameAr,
    })
  } catch {
    /* non-fatal */
  }
}

/** Test helper — reset process seed guard. */
export function resetEmployeeAllowlistSeedForTests(): void {
  allowlistSeeded = false
}
