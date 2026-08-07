import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, requireRealUser } from '@/lib/auth/session'
import { isWorkspaceOwnerEmail } from '@/lib/auth/roles'
import {
  deleteMailbox,
  getMailboxPublic,
  upsertMailbox,
} from '@/lib/email/imap-store'
import {
  testImapConnection,
} from '@/lib/email/imap-sync'
import { testSmtpConnection } from '@/lib/email/smtp-send'

export const dynamic = 'force-dynamic'

async function requireOwner(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth
  if (!isWorkspaceOwnerEmail(auth.user.email)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: 'إدارة بريد الجمعية للمالك فقط (ryodan71).',
          code: 'FORBIDDEN',
        },
        { status: 403 }
      ),
    }
  }
  return auth
}

/** Public status for any signed-in user (no secrets). */
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return NextResponse.json(
      { error: 'يلزم تسجيل الدخول.', code: 'AUTH_REQUIRED' },
      { status: 401 }
    )
  }
  const mailbox = await getMailboxPublic()
  return NextResponse.json({
    configured: Boolean(mailbox?.configured),
    mailbox,
    isOwner: isWorkspaceOwnerEmail(user.email),
    hintAr:
      'البريد الرسمي (مثل info@alhuda-alhikma.sa) يُربط عبر IMAP/SMTP دون الحاجة لـ Google Workspace.',
  })
}

export async function PUT(req: NextRequest) {
  const auth = await requireOwner(req)
  if (!auth.ok) return auth.response

  let body: {
    labelAr?: string
    emailAddress?: string
    imapHost?: string
    imapPort?: number
    imapSecure?: boolean
    smtpHost?: string
    smtpPort?: number
    smtpSecure?: boolean
    username?: string
    password?: string
    enabled?: boolean
    notifyTelegram?: boolean
    test?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'جسم JSON غير صالح.' }, { status: 400 })
  }

  try {
    const emailAddress = String(body.emailAddress || '').trim()
    const { guessMailHosts } = await import('@/lib/integrations/auto-wire')
    const guessed = guessMailHosts(emailAddress)
    const imapHost =
      String(body.imapHost || '').trim() || guessed.imapHost
    const smtpHost =
      String(body.smtpHost || '').trim() || guessed.smtpHost || imapHost

    const mailbox = await upsertMailbox({
      labelAr: body.labelAr,
      emailAddress,
      imapHost,
      imapPort:
        typeof body.imapPort === 'number' ? body.imapPort : undefined,
      imapSecure: body.imapSecure,
      smtpHost,
      smtpPort:
        typeof body.smtpPort === 'number' ? body.smtpPort : undefined,
      smtpSecure: body.smtpSecure,
      username: String(body.username || body.emailAddress || '').trim(),
      password: body.password,
      enabled: body.enabled,
      notifyTelegram: body.notifyTelegram ?? true,
      createdBy: auth.user.id,
    })

    let imapTest: { ok: boolean; messageAr: string } | null = null
    let smtpTest: { ok: boolean; messageAr: string } | null = null
    if (body.test !== false) {
      imapTest = await testImapConnection()
      smtpTest = await testSmtpConnection()
    }

    return NextResponse.json({
      ok: true,
      mailbox,
      imapTest,
      smtpTest,
      messageAr: 'حُفظت إعدادات بريد الجمعية (كلمة المرور مشفّرة).',
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : 'فشل الحفظ',
      },
      { status: 400 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOwner(req)
  if (!auth.ok) return auth.response
  await deleteMailbox()
  return NextResponse.json({
    ok: true,
    messageAr: 'حُذفت إعدادات بريد IMAP/SMTP والرسائل المخزّنة.',
  })
}
