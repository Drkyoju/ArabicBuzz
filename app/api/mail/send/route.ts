import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import { forbidOrgMailIfMember } from '@/lib/email/org-mail-access'
import { sendSmtpMail } from '@/lib/email/smtp-send'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const denied = forbidOrgMailIfMember(auth.user)
  if (denied) return denied

  let body: {
    to?: string
    subject?: string
    bodyText?: string
    bodyHtml?: string
    cc?: string
    bcc?: string
    replyToMessageId?: string
    replyAll?: boolean
    /** @deprecated HITL no longer gates mail send (delete-only approvals). */
    forceSend?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON غير صالح.' }, { status: 400 })
  }

  try {
    const result = await sendSmtpMail({
      to: String(body.to || ''),
      subject: String(body.subject || ''),
      bodyText: body.bodyText,
      bodyHtml: body.bodyHtml,
      cc: body.cc,
      bcc: body.bcc,
      replyToMessageId: body.replyToMessageId,
      replyAll: body.replyAll === true,
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'فشل الإرسال' },
      { status: 400 }
    )
  }
}
