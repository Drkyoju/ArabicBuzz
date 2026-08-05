import { getSupabaseAdmin } from '@/lib/supabase/server'
import { syncOrgRoleFromEmail } from '@/lib/auth/rbac'

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

  const orgId = process.env.DEFAULT_ORG_ID || 'org-demo'
  if (data.user?.id) {
    await syncOrgRoleFromEmail(data.user.id, orgId, data.user.email || email)
  }

  return Response.json({ session: data.session, user: data.user })
}
