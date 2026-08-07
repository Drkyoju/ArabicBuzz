import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import { isWorkspaceOwnerEmail } from '@/lib/auth/roles'
import { canAccessOpsUi, orgRoleForEmail } from '@/lib/auth/rbac'
import { syncImapInbox } from '@/lib/email/imap-sync'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const role = orgRoleForEmail(auth.user.email, { userId: auth.user.id })
  if (!isWorkspaceOwnerEmail(auth.user.email) && !canAccessOpsUi(role)) {
    return NextResponse.json(
      { error: 'مزامنة البريد للمدير/المالك فقط.', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  let maxMessages = 40
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.maxMessages === 'number') maxMessages = body.maxMessages
  } catch {
    /* empty */
  }

  const result = await syncImapInbox({
    maxMessages,
    notifyTelegram: true,
  })
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
