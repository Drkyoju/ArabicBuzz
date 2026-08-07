import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { forbidOrgMailIfMember } from '@/lib/email/org-mail-access'
import {
  countUnread,
  getMailboxPublic,
  isImapConfigured,
} from '@/lib/email/imap-store'

export const dynamic = 'force-dynamic'

/** Lightweight unread poll for the header bell. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const denied = forbidOrgMailIfMember(auth.user)
  if (denied) {
    // Members: no org mailbox metadata leak — empty safe payload.
    return NextResponse.json({
      configured: false,
      unread: 0,
      emailAddress: null,
      lastSyncAt: null,
      forbidden: true,
    })
  }

  const configured = await isImapConfigured()
  if (!configured) {
    return NextResponse.json({
      configured: false,
      unread: 0,
      emailAddress: null,
      lastSyncAt: null,
    })
  }

  const [mailbox, unread] = await Promise.all([
    getMailboxPublic(),
    countUnread(),
  ])

  return NextResponse.json({
    configured: true,
    unread,
    emailAddress: mailbox?.emailAddress || null,
    lastSyncAt: mailbox?.lastSyncAt || null,
    lastErrorAr: mailbox?.lastErrorAr || null,
  })
}
