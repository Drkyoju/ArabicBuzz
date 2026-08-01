import { getSupabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Body = { email?: string; password?: string }

/**
 * Email sign-in (server). Uses service client so login works even if
 * the browser anon key is restricted.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')

  if (!email.includes('@') || !password) {
    return Response.json(
      { error: 'أدخل البريد وكلمة المرور.' },
      { status: 400 }
    )
  }

  const admin = getSupabaseAdmin()
  if (!admin) {
    return Response.json(
      { error: 'Supabase غير مُعدّ على الخادم.' },
      { status: 500 }
    )
  }

  const { data, error } = await admin.auth.signInWithPassword({
    email,
    password,
  })
  if (error || !data.session) {
    return Response.json(
      { error: error?.message || 'بيانات الدخول غير صحيحة.' },
      { status: 401 }
    )
  }

  return Response.json({ session: data.session, user: data.user })
}
