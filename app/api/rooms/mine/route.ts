import { NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import { isWorkspaceOwnerEmail } from '@/lib/auth/roles'
import { DEMO_OPEN_SCOPES, listMyRoomScopes } from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'

/**
 * GET — rooms the signed-in user should see in the sidebar
 * (memberships + demo open scopes; owner also sees owned rooms).
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
    { scopeId: string; nameAr?: string; role?: string; kind: 'personal' | 'shared' }
  >()

  for (const id of DEMO_OPEN_SCOPES) {
    byId.set(id, {
      scopeId: id,
      kind: id.startsWith('personal-') ? 'personal' : 'shared',
      role: isWorkspaceOwnerEmail(email) ? 'owner' : 'member',
    })
  }

  for (const row of listed) {
    byId.set(row.scopeId, {
      scopeId: row.scopeId,
      nameAr: row.nameAr,
      role: row.role,
      kind: row.scopeId.startsWith('personal-') ? 'personal' : 'shared',
    })
  }

  return NextResponse.json({
    ok: true,
    rooms: [...byId.values()],
    owner: isWorkspaceOwnerEmail(email),
  })
}
