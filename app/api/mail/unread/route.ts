import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
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
    features: { corpusSearch: true, sentSync: true, aiReplyActions: true },
  })
}
