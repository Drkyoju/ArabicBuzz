import { getSupabaseAdmin } from '@/lib/supabase/server'
import { syncOrgRoleFromEmail } from '@/lib/auth/rbac'
import type { Session, User } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * Verify the email OTP code and return a session.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string
    token?: string
  }
  const email = String(body.email || '').trim().toLowerCase()
  const token = String(body.token || '').trim().replace(/\s+/g, '')

  if (!email.includes('@') || token.length < 4) {
    return Response.json(
      { error: 'أدخل البريد ورمز الدخول من الرسالة.' },
      { status: 400 }
    )
  }

  const admin = getSupabaseAdmin()
  if (!admin) {
    return Response.json({ error: 'Supabase غير مُعدّ.' }, { status: 500 })
  }

  async function finish(session: Session, user: User) {
    const orgId = process.env.DEFAULT_ORG_ID || 'org-demo'
    await syncOrgRoleFromEmail(user.id, orgId, user.email || email)
    return Response.json({ session, user })
  }

  const { data, error } = await admin.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error || !data.session || !data.user) {
    const retry = await admin.auth.verifyOtp({
      email,
      token,
      type: 'magiclink',
    })
    if (retry.error || !retry.data.session || !retry.data.user) {
      return Response.json(
        {
          error:
            error?.message ||
            retry.error?.message ||
            'الرمز غير صحيح أو منتهٍ. اطلب رمزاً جديداً.',
        },
        { status: 401 }
      )
    }
    return finish(retry.data.session, retry.data.user)
  }

  return finish(data.session, data.user)
}
