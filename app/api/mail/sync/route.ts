import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import { forbidOrgMailIfMember } from '@/lib/email/org-mail-access'
import { syncImapInbox } from '@/lib/email/imap-sync'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const denied = forbidOrgMailIfMember(auth.user)
  if (denied) return denied

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
