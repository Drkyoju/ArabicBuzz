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
  const folderRaw = (url.searchParams.get('folder') || 'INBOX').toLowerCase()
  const folder =
    folderRaw === 'all'
      ? ('all' as const)
      : folderRaw === 'sent'
        ? ('Sent' as const)
        : ('INBOX' as const)

  const [mailbox, messages, unread] = await Promise.all([
    getMailboxPublic(),
    listMessages({ unreadOnly, query: q, limit, folder }),
    countUnread(),
  ])

  return NextResponse.json({
    configured: Boolean(mailbox?.configured),
    emailAddress: mailbox?.emailAddress || null,
    unread,
    lastSyncAt: mailbox?.lastSyncAt || null,
    lastErrorAr: mailbox?.lastErrorAr || null,
    folder,
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
      folder: m.folder,
      messageId: m.message_id,
    })),
  })
}
