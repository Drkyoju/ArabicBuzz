import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getMessageById } from '@/lib/email/imap-store'
import { messageAttachments } from '@/lib/email/mail-intel'

export const dynamic = 'force-dynamic'

/**
 * Download an org IMAP message attachment (bytes stored at sync when ≤2.5MB).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; attId: string }> }
) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const { id, attId } = await ctx.params
  const row = await getMessageById(id)
  if (!row) {
    return NextResponse.json(
      { error: 'الرسالة غير موجودة — زامن الوارد أولاً.' },
      { status: 404 }
    )
  }

  const attachments = messageAttachments(row)
  const att =
    attachments.find((a) => a.id === attId) ||
    attachments.find((a) => a.filename === decodeURIComponent(attId))
  if (!att) {
    return NextResponse.json({ error: 'المرفق غير موجود.' }, { status: 404 })
  }
  if (!att.contentBase64) {
    return NextResponse.json(
      {
        error:
          'لا تتوفر بيانات المرفق محلياً (قد يتجاوز حد المزامنة). أعد المزامنة أو افتح من العميل الأصلي.',
        messageAr:
          'المرفق أكبر من حد التخزين المحلي أو لم يُحفظ عند المزامنة.',
      },
      { status: 404 }
    )
  }

  let buf: Buffer
  try {
    buf = Buffer.from(att.contentBase64, 'base64')
  } catch {
    return NextResponse.json({ error: 'بيانات المرفق تالفة.' }, { status: 500 })
  }

  const filename = att.filename || 'attachment.bin'
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': att.mimeType || 'application/octet-stream',
      'Content-Length': String(buf.length),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
