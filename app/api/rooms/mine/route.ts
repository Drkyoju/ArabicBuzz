import { NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import { isWorkspaceOwnerEmail } from '@/lib/auth/roles'
import { DEMO_OPEN_SCOPES, listMyRoomScopes } from '@/lib/rooms/persist'
import {
  PERSONAL_DESK_COPY,
  ownsPersonalScope,
  personalDeskScopeId,
} from '@/lib/scopes/personal-desk'

export const dynamic = 'force-dynamic'

/**
 * GET — rooms the signed-in user should see in the sidebar
 * (memberships + shared demo rooms + this user's private desk only).
 */
export async function GET(request: Request) {
  const auth = await requireRealUser(request)
  if (!auth.ok) return auth.response

  const email = auth.user.email || null
  const listed = await listMyRoomScopes({
    userId: auth.user.id,
    email,
  })

  const byId = new Map<
    string,
    {
      scopeId: string
      nameAr?: string
      role?: string
      kind: 'personal' | 'shared'
    }
  >()

  // Shared starter rooms only — never inject legacy personal-demo for everyone.
  for (const id of DEMO_OPEN_SCOPES) {
    if (id.startsWith('personal-')) continue
    byId.set(id, {
      scopeId: id,
      kind: 'shared',
      role: isWorkspaceOwnerEmail(email) ? 'owner' : 'member',
    })
  }

  const deskId = personalDeskScopeId(auth.user.id)
  byId.set(deskId, {
    scopeId: deskId,
    nameAr: PERSONAL_DESK_COPY.nameAr,
    kind: 'personal',
    role: 'owner',
  })

  for (const row of listed) {
    // Never surface another user's personal desk.
    if (
      row.scopeId.startsWith('personal-') &&
      !ownsPersonalScope(row.scopeId, auth.user.id)
    ) {
      continue
    }
    byId.set(row.scopeId, {
      scopeId: row.scopeId,
      nameAr: row.nameAr,
      role: row.role,
      kind: row.scopeId.startsWith('personal-') ? 'personal' : 'shared',
    })
  }

  // Ensure desk name stays canonical.
  const desk = byId.get(deskId)
  if (desk) {
    byId.set(deskId, {
      ...desk,
      nameAr: PERSONAL_DESK_COPY.nameAr,
      kind: 'personal',
      role: 'owner',
    })
  }

  return NextResponse.json({
    ok: true,
    rooms: [...byId.values()],
    personalDeskScopeId: deskId,
    owner: isWorkspaceOwnerEmail(email),
  })
}
