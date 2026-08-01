import { getSupabaseAdmin } from '@/lib/supabase/server'

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

  const { data, error } = await admin.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error || !data.session) {
    // Try magiclink/token type variants
    const retry = await admin.auth.verifyOtp({
      email,
      token,
      type: 'magiclink',
    })
    if (retry.error || !retry.data.session) {
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
    return Response.json({
      session: retry.data.session,
      user: retry.data.user,
    })
  }

  return Response.json({ session: data.session, user: data.user })
}
