import { getSupabaseAdmin } from '@/lib/supabase/server'
import { seedOrgMembership } from '@/lib/auth/rbac'

export const dynamic = 'force-dynamic'

const DEMO_EMAIL =
  process.env.DEMO_USER_EMAIL?.trim() || 'demo@arabicbuzz.local'
const DEMO_PASSWORD =
  process.env.DEMO_USER_PASSWORD?.trim() || 'ArabicBuzz-Demo-2026!'

/**
 * One-click demo login so the workspace UI is usable without OTP.
 * Creates the demo user if missing (service role), then returns a session.
 */
export async function POST() {
  const admin = getSupabaseAdmin()
  if (!admin) {
    return Response.json(
      { error: 'Supabase غير مُعدّ على الخادم.' },
      { status: 500 }
    )
  }

  let signIn = await admin.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  })

  if (signIn.error || !signIn.data.session) {
    const created = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: 'مستخدم تجريبي',
        demo: true,
      },
    })
    if (created.error && !/already|registered|exists/i.test(created.error.message)) {
      return Response.json(
        { error: created.error.message || 'تعذّر إنشاء حساب تجريبي' },
        { status: 500 }
      )
    }
    // If user exists but password differs, try update
    if (created.error) {
      const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
      const existing = list.data.users.find(
        (u) => u.email?.toLowerCase() === DEMO_EMAIL
      )
      if (existing) {
        await admin.auth.admin.updateUserById(existing.id, {
          password: DEMO_PASSWORD,
          email_confirm: true,
        })
      }
    }
    signIn = await admin.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    })
  }

  if (signIn.error || !signIn.data.session || !signIn.data.user) {
    return Response.json(
      {
        error:
          signIn.error?.message ||
          'تعذّر الدخول التجريبي. تحقق من SUPABASE_SERVICE_ROLE_KEY.',
      },
      { status: 500 }
    )
  }

  seedOrgMembership(signIn.data.user.id, 'org-demo', 'OWNER')
  seedOrgMembership('user-1', 'org-demo', 'OWNER')

  return Response.json({
    ok: true,
    messageAr: 'تم الدخول كمستخدم تجريبي',
    session: signIn.data.session,
    user: signIn.data.user,
  })
}
