import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { isWorkspaceOwnerEmail } from '@/lib/auth/roles'

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

function authRequiredResponse(errorAr: string): Response {
  return Response.json(
    { error: errorAr, code: 'AUTH_REQUIRED', loginUrl: '/auth/login' },
    { status: 401 }
  )
}

async function requireNonSyntheticUser(
  req: Request,
  missingTokenAr: string,
  syntheticAr: string
): Promise<{ ok: true; user: User } | { ok: false; response: Response }> {
  const header = req.headers.get('authorization') || ''
  if (!/^Bearer\s+\S+/i.test(header)) {
    return { ok: false, response: authRequiredResponse(missingTokenAr) }
  }
  const user = await getUserFromRequest(req)
  if (!user || isSyntheticUser(user)) {
    return { ok: false, response: authRequiredResponse(syntheticAr) }
  }
  return { ok: true, user }
}

/**
 * Require a real Supabase session before returning room / tenant data.
 *
 * `getUserFromRequest` falls back to the synthetic local owner whenever
 * AUTH_REQUIRED is off, which made every room read world-readable on the
 * public deployment. Reads of non-public data must use this instead.
 */
export function requireSessionUser(req: Request) {
  return requireNonSyntheticUser(
    req,
    'سجّل الدخول لعرض بيانات الغرفة.',
    'جلسة غير صالحة — سجّل الدخول بحساب حقيقي لعرض بيانات الغرفة.'
  )
}

/**
 * Require a real Supabase session (not local-owner). Use for mutations that
 * must not hit production tables from anonymous guests.
 */
export function requireRealUser(req: Request) {
  return requireNonSyntheticUser(
    req,
    'يلزم تسجيل الدخول لتنفيذ هذا الإجراء.',
    'جلسة غير صالحة — سجّل الدخول بحساب حقيقي.'
  )
}

/**
 * Require the sole workspace owner email (ryodan71@gmail.com).
 * Use for owner-only management UIs (skills catalog, mail settings, etc.).
 */
export async function requireWorkspaceOwner(
  req: Request,
  errorAr = 'هذا الإجراء للمالك فقط.'
): Promise<{ ok: true; user: User } | { ok: false; response: Response }> {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth
  if (!isWorkspaceOwnerEmail(auth.user.email)) {
    return {
      ok: false,
      response: Response.json(
        { error: errorAr, code: 'FORBIDDEN' },
        { status: 403 }
      ),
    }
  }
  return auth
}
