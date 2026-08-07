import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser, requireRealUser } from '@/lib/auth/session'
import { listGoogleAccounts } from '@/lib/google/tokens'
import { searchGmailMessages } from '@/lib/google/gmail'
import { PERSONAL_DESK_COPY } from '@/lib/scopes/personal-desk'

export const dynamic = 'force-dynamic'

/**
 * Personal mailbox (caller's Google/Gmail) — separate from org IMAP info@.
 * GET: connection status + unread snippets for the personal desk.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const accounts = await listGoogleAccounts(auth.user.id)
  const emails = accounts.map((a) => a.email).filter(Boolean) as string[]

  if (accounts.length === 0) {
    return NextResponse.json({
      connected: false,
      unread: 0,
      messages: [],
      emails: [],
      email: null,
      hintAr: PERSONAL_DESK_COPY.mailOrgVsPersonalAr,
      messageAr:
        'اربط بريدك الشخصي (Gmail / Google) لاستخدام الوارد والمسودات في مساحتك الخاصة.',
    })
  }

  try {
    const messages = await searchGmailMessages(auth.user.id, {
      query: 'is:unread',
      maxResults: 12,
    })
    return NextResponse.json({
      connected: true,
      unread: messages.length,
      messages: messages.map((m) => ({
        id: m.id,
        subject: m.subject,
        from: m.from,
        date: m.date,
        snippet: m.snippet,
      })),
      emails,
      email: emails[0] || null,
      hintAr: PERSONAL_DESK_COPY.mailOrgVsPersonalAr,
      messageAr: `بريدك الشخصي مربوط (${emails[0] || 'Gmail'}) — غير مرئي لغرفة الفريق.`,
    })
  } catch (e) {
    return NextResponse.json({
      connected: true,
      unread: 0,
      messages: [],
      emails,
      email: emails[0] || null,
      hintAr: PERSONAL_DESK_COPY.mailOrgVsPersonalAr,
      warningAr:
        e instanceof Error
          ? e.message
          : 'تعذّر قراءة الوارد — أعد ربط Google بصلاحية Gmail.',
    })
  }
}

/** Draft assist stub — returns a reply draft; does not send. */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    messageId?: string
  }
  if (body.action !== 'draft_assist') {
    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  }

  const accounts = await listGoogleAccounts(auth.user.id)
  if (!accounts.length) {
    return NextResponse.json(
      {
        error: 'اربط بريدك الشخصي أولاً من مساحتك الشخصية.',
        needsGoogle: true,
      },
      { status: 400 }
    )
  }

  const messageId = String(body.messageId || '').trim()
  if (!messageId) {
    return NextResponse.json({ error: 'مرّر messageId' }, { status: 400 })
  }

  try {
    const { readGmailMessage } = await import('@/lib/google/gmail')
    const msg = await readGmailMessage(auth.user.id, messageId)
    const draftSubject = msg.subject?.startsWith('Re:')
      ? msg.subject
      : `Re: ${msg.subject || 'بدون موضوع'}`
    const draftBody = [
      'السلام عليكم،',
      '',
      'شكراً لرسالتكم. سأرد بالتفصيل قريباً.',
      '',
      'مع التحية',
    ].join('\n')
    return NextResponse.json({
      ok: true,
      draft: {
        subject: draftSubject,
        bodyAr: draftBody,
        inReplyTo: msg.id,
        fromOriginal: msg.from,
      },
      messageAr:
        'مسودة رد جاهزة في مساحتك الشخصية — لم يُرسل شيء. راجعها أو اطلب من الوكيل تحسينها.',
      hintAr: PERSONAL_DESK_COPY.mailOrgVsPersonalAr,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'تعذّر إعداد المسودة' },
      { status: 500 }
    )
  }
}
