import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import { isWorkspaceOwnerEmail } from '@/lib/auth/roles'
import { canAccessOpsUi, orgRoleForEmail } from '@/lib/auth/rbac'
import { sendSmtpMail } from '@/lib/email/smtp-send'
import { isHitlDisabled } from '@/lib/security/posture'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const role = orgRoleForEmail(auth.user.email, { userId: auth.user.id })
  if (!isWorkspaceOwnerEmail(auth.user.email) && !canAccessOpsUi(role)) {
    return NextResponse.json(
      { error: 'إرسال البريد للمدير/المالك فقط.', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  let body: {
    to?: string
    subject?: string
    bodyText?: string
    bodyHtml?: string
    cc?: string
    bcc?: string
    replyToMessageId?: string
    replyAll?: boolean
    /** When true, send immediately even if HITL would normally pause agents. */
    forceSend?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON غير صالح.' }, { status: 400 })
  }

  // Owner/ops UI may force-send; otherwise respect HITL kill-switch.
  if (!isHitlDisabled() && !body.forceSend && !isWorkspaceOwnerEmail(auth.user.email)) {
    return NextResponse.json(
      {
        error:
          'الموافقات البشرية مفعّلة — استخدم المساعد لإرسال مسودة تخضع للموافقة، أو أرسل من لوحة المالك (forceSend).',
        code: 'HITL_REQUIRED',
        draft: {
          to: body.to,
          subject: body.subject,
          bodyText: body.bodyText,
        },
      },
      { status: 409 }
    )
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
