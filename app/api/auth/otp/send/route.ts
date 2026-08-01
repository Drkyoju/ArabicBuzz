import { authCallbackUrl } from '@/lib/app-url'
import { getSupabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Send a one-time login code / magic link to the user's email (passwordless).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string }
  const email = String(body.email || '').trim().toLowerCase()
  if (!email.includes('@')) {
    return Response.json(
      { error: 'أدخل بريداً إلكترونياً صالحاً.' },
      { status: 400 }
    )
  }

  const admin = getSupabaseAdmin()
  if (!admin) {
    return Response.json({ error: 'Supabase غير مُعدّ.' }, { status: 500 })
  }

  const redirectTo = authCallbackUrl()

  const { error } = await admin.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  })

  if (error) {
    return Response.json(
      {
        error:
          error.message ||
          'تعذّر إرسال رمز الدخول. تحقق من تفعيل البريد في Supabase.',
      },
      { status: 400 }
    )
  }

  return Response.json({
    ok: true,
    messageAr:
      'تم إرسال رمز الدخول إلى بريدك. افتح الرسالة وأدخل الرمز هنا (أو اضغط رابط الدخول إن وُجد).',
  })
}
