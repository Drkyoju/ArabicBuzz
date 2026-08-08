import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { searchOrgMailCorpus } from '@/lib/email/mail-corpus-search'
import type { MailFolderFilter } from '@/lib/email/imap-store'

export const dynamic = 'force-dynamic'

/**
 * Corpus search: inbox + sent + attachment text + workspace/knowledge files.
 * Available to any signed-in member (same as org mail read).
 */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const url = req.nextUrl
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Number(url.searchParams.get('limit') || '30')
  const folderRaw = (url.searchParams.get('folder') || 'all').toLowerCase()
  const folder: MailFolderFilter =
    folderRaw === 'inbox'
      ? 'INBOX'
      : folderRaw === 'sent'
        ? 'Sent'
        : 'all'
  const includeFiles = url.searchParams.get('files') !== '0'

  if (!q) {
    return NextResponse.json({
      hits: [],
      messageAr: 'اكتب كلمة للبحث في كل البريد والملفات.',
    })
  }

  try {
    const result = await searchOrgMailCorpus({
      query: q,
      limit,
      folder,
      includeFiles,
    })
    return NextResponse.json(result)
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
