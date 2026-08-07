import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { countUnread, listMessages } from '@/lib/email/imap-store'
import { getMailboxPublic } from '@/lib/email/imap-store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const url = req.nextUrl
  const unreadOnly = url.searchParams.get('unread') === '1'
  const q = url.searchParams.get('q') || undefined
  const limit = Number(url.searchParams.get('limit') || '40')

  const [mailbox, messages, unread] = await Promise.all([
    getMailboxPublic(),
    listMessages({ unreadOnly, query: q, limit }),
    countUnread(),
  ])

  return NextResponse.json({
    configured: Boolean(mailbox?.configured),
    emailAddress: mailbox?.emailAddress || null,
    unread,
    lastSyncAt: mailbox?.lastSyncAt || null,
    lastErrorAr: mailbox?.lastErrorAr || null,
    messages: messages.map((m) => ({
      id: m.id,
      uid: Number(m.uid),
      subject: m.subject,
      from: m.from_addr,
      to: m.to_addr,
      cc: m.cc_addr,
      date: m.date_at ? new Date(m.date_at).toISOString() : null,
      snippet: m.snippet,
      seen: m.seen,
      answered: m.answered,
      messageId: m.message_id,
    })),
  })
}
