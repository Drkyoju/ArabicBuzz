import { getSupabaseAdmin } from '@/lib/supabase/server'
import { syncOrgRoleFromEmail } from '@/lib/auth/rbac'

export const dynamic = 'force-dynamic'

type Body = { email?: string; password?: string }

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

async function syncRole(userId: string, email: string) {
  const orgId = process.env.DEFAULT_ORG_ID || 'org-demo'
  await syncOrgRoleFromEmail(userId, orgId, email)
}

/**
 * Email signup via service_role so users are confirmed immediately
 * (no dashboard "Confirm email" toggle required).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')

  if (!email.includes('@') || password.length < 6) {
    return bad('أدخل بريداً صالحاً وكلمة مرور من 6 أحرف على الأقل.')
  }

  const admin = getSupabaseAdmin()
  if (!admin || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return bad('SUPABASE_SERVICE_ROLE_KEY غير متوفر على الخادم.', 500)
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: email.split('@')[0] },
  })

  if (createError) {
    // Already registered → try sign-in instead
    if (
      /already|registered|exists/i.test(createError.message) ||
      createError.status === 422
    ) {
      const { data: signed, error: signError } =
        await admin.auth.signInWithPassword({ email, password })
      if (signError || !signed.session) {
        return bad(
          signError?.message ||
            'البريد مسجّل مسبقاً. استخدم تسجيل الدخول أو كلمة مرور صحيحة.',
          400
        )
      }
      if (signed.user?.id) await syncRole(signed.user.id, email)
      return Response.json({
        session: signed.session,
        user: signed.user,
        created: false,
      })
    }
    return bad(createError.message, 400)
  }

  const { data: signed, error: signError } = await admin.auth.signInWithPassword({
    email,
    password,
  })
  if (signError || !signed.session) {
    return bad(
      signError?.message ||
        'تم إنشاء الحساب لكن تعذّر فتح الجلسة. جرّب تسجيل الدخول.',
      500
    )
  }

  const user = signed.user || created.user
  if (user?.id) await syncRole(user.id, email)

  return Response.json({
    session: signed.session,
    user,
    created: true,
  })
}
