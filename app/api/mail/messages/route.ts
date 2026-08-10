import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import {
  countUnread,
  listMessages,
  type MailIntelCache,
} from '@/lib/email/imap-store'
import { getMailboxPublic } from '@/lib/email/imap-store'
import { searchOrgMailCorpus } from '@/lib/email/mail-corpus-search'
import { classifyMailTriage } from '@/lib/email/mail-triage'

export const dynamic = 'force-dynamic'

function intelFromRow(m: {
  intel_json?: unknown
}): MailIntelCache | null {
  const raw = m.intel_json
  if (!raw) return null
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed && typeof parsed === 'object'
      ? (parsed as MailIntelCache)
      : null
  } catch {
    return null
  }
}

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

  // Full corpus: mail (inbox+sent+attachments) + workspace/knowledge files.
  if (url.searchParams.get('corpus') === '1' && q?.trim()) {
    try {
      const result = await searchOrgMailCorpus({
        query: q.trim(),
        limit,
        folder: folderRaw === 'inbox' ? 'INBOX' : folder,
        includeFiles: url.searchParams.get('files') !== '0',
      })
      return NextResponse.json({
        ...result,
        features: { corpusSearch: true, sentSync: true, aiReplyActions: true },
      })
    } catch (e) {
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : 'فشل البحث',
          hits: [],
        },
        { status: 500 }
      )
    }
  }

  const [mailbox, messages, unread] = await Promise.all([
    getMailboxPublic(),
    listMessages({ unreadOnly, query: q, limit, folder }),
    countUnread(),
  ])

  const mapped = messages.map((m) => {
    const intel = intelFromRow(m)
    const triage = classifyMailTriage({
      subject: m.subject,
      snippet: m.snippet,
      from: m.from_addr,
      seen: m.seen,
      answered: m.answered,
      hasAttachments: Boolean(
        Array.isArray(m.attachments_json)
          ? m.attachments_json.length
          : m.attachments_json
      ),
      priority: intel?.priority,
      classify: intel?.classify,
    })
    return {
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
      triageLabelAr: intel?.triageLabelAr || triage.labelAr,
      priority: triage.priority,
      classify: triage.classify,
      sortBoost: triage.sortBoost,
    }
  })

  // Light sort hint: priority first, then date — never hide messages.
  mapped.sort((a, b) => {
    const boost = (b.sortBoost || 0) - (a.sortBoost || 0)
    if (boost !== 0) return boost
    const ta = a.date ? new Date(a.date).getTime() : 0
    const tb = b.date ? new Date(b.date).getTime() : 0
    return tb - ta
  })

  return NextResponse.json({
    configured: Boolean(mailbox?.configured),
    emailAddress: mailbox?.emailAddress || null,
    unread,
    lastSyncAt: mailbox?.lastSyncAt || null,
    lastErrorAr: mailbox?.lastErrorAr || null,
    folder,
    features: {
      corpusSearch: true,
      sentSync: true,
      aiReplyActions: true,
      triageHints: true,
    },
    messages: mapped,
  })
}
