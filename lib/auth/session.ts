import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

/** Personal / single-user mode — no login wall. Set AUTH_REQUIRED=true to re-enable. */
export function isAuthRequired(): boolean {
  return (process.env.AUTH_REQUIRED || '').toLowerCase() === 'true'
}

/** Synthetic owner used when auth is off. */
export function localOwnerUser(): User {
  return {
    id: 'local-owner',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@arabicbuzz.local',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'local', providers: ['local'] },
    user_metadata: { full_name: 'المالك', demo: true },
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  } as User
}

/** True for soft-auth placeholder / guest without a real Supabase session. */
export function isSyntheticUser(user: User | null | undefined): boolean {
  if (!user) return true
  return (
    user.id === 'local-owner' ||
    user.app_metadata?.provider === 'local' ||
    user.email === 'owner@arabicbuzz.local'
  )
}

function adminOrAnonClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Resolve the signed-in Supabase user from `Authorization: Bearer <access_token>`.
 * Prefers a real session when present (needed for Google Calendar even if AUTH_REQUIRED=false).
 */
export async function getUserFromRequest(req: Request): Promise<User | null> {
  const header = req.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim()

  if (token) {
    const supabase = adminOrAnonClient()
    if (supabase) {
      const { data, error } = await supabase.auth.getUser(token)
      if (!error && data.user) return data.user
    }
  }

  if (!isAuthRequired()) return localOwnerUser()
  return null
}

export async function requireUser(req: Request): Promise<
  | { ok: true; user: User }
  | { ok: false; response: Response }
> {
  const user = await getUserFromRequest(req)
  if (user) return { ok: true, user }

  return {
    ok: false,
    response: Response.json(
      {
        error: 'يلزم تسجيل الدخول لاستخدام النماذج.',
        code: 'AUTH_REQUIRED',
        loginUrl: '/auth/login',
      },
      { status: 401 }
    ),
  }
}

/**
 * Require a real Supabase session (not local-owner). Use for mutations that
 * must not hit production tables from anonymous guests.
 */
export async function requireRealUser(req: Request): Promise<
  | { ok: true; user: User }
  | { ok: false; response: Response }
> {
  const header = req.headers.get('authorization') || ''
  if (!/^Bearer\s+\S+/i.test(header)) {
    return {
      ok: false,
      response: Response.json(
        {
          error: 'يلزم تسجيل الدخول لتنفيذ هذا الإجراء.',
          code: 'AUTH_REQUIRED',
          loginUrl: '/auth/login',
        },
        { status: 401 }
      ),
    }
  }
  const user = await getUserFromRequest(req)
  if (!user || isSyntheticUser(user)) {
    return {
      ok: false,
      response: Response.json(
        {
          error: 'جلسة غير صالحة — سجّل الدخول بحساب حقيقي.',
          code: 'AUTH_REQUIRED',
          loginUrl: '/auth/login',
        },
        { status: 401 }
      ),
    }
  }
  return { ok: true, user }
}
