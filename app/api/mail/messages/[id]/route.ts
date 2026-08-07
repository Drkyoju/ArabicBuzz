import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getMessageById, markSeen } from '@/lib/email/imap-store'
import {
  messageAttachments,
  messageIntel,
} from '@/lib/email/mail-intel'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const row = await getMessageById(id)
  if (!row) {
    return NextResponse.json(
      { error: 'الرسالة غير موجودة — زامن الوارد أولاً.' },
      { status: 404 }
    )
  }

  // Opening marks as seen in local cache
  if (!row.seen) {
    await markSeen(row.id, true).catch(() => null)
  }

  const attachments = messageAttachments(row).map((a) => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    size: a.size,
    hasText: Boolean(a.extractedText?.trim()),
    extractMethod: a.extractMethod || null,
    extractNoteAr: a.extractNoteAr || null,
    ocrUsed: Boolean(a.ocrUsed),
    textPreview: a.extractedText?.trim()
      ? a.extractedText.trim().slice(0, 800)
      : null,
  }))

  return NextResponse.json({
    message: {
      id: row.id,
      uid: Number(row.uid),
      subject: row.subject,
      from: row.from_addr,
      to: row.to_addr,
      cc: row.cc_addr,
      date: row.date_at ? new Date(row.date_at).toISOString() : null,
      snippet: row.snippet,
      bodyText: row.body_text,
      bodyHtml: row.body_html,
      seen: true,
      answered: row.answered,
      messageId: row.message_id,
      inReplyTo: row.in_reply_to,
      attachments,
      intel: messageIntel(row),
    },
  })
}
