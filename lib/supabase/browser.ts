import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function publicSupabaseConfig() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  return { url, anonKey }
}

export function isSupabaseConfigured() {
  const { url, anonKey } = publicSupabaseConfig()
  return Boolean(url && anonKey)
}

/** Browser Supabase client (email + optional OAuth). */
export function createBrowserSupabaseClient(): SupabaseClient {
  const { url, anonKey } = publicSupabaseConfig()
  if (!url || !anonKey) {
    throw new Error(
      'Supabase غير مُعدّ. اضبط NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
}

export type OAuthProvider = 'google' | 'github'

export function getAuthRedirectTo() {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base.replace(/\/$/, '')}/auth/callback`
}

/** Send passwordless login code to email. */
export async function sendEmailOtp(email: string) {
  const res = await fetch('/api/auth/otp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim() }),
  })
  const payload = (await res.json()) as { error?: string; messageAr?: string }
  if (!res.ok) throw new Error(payload.error || 'تعذّر إرسال الرمز')
  return payload
}

/** Verify email OTP and establish browser session. */
export async function verifyEmailOtp(email: string, token: string) {
  const res = await fetch('/api/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), token: token.trim() }),
  })
  const payload = (await res.json()) as {
    error?: string
    session?: { access_token: string; refresh_token: string }
  }
  if (!res.ok || !payload.session) {
    throw new Error(payload.error || 'تعذّر التحقق من الرمز')
  }
  const supabase = createBrowserSupabaseClient()
  const { data, error } = await supabase.auth.setSession({
    access_token: payload.session.access_token,
    refresh_token: payload.session.refresh_token,
  })
  if (error) throw error
  return data
}

/** Email + password registration (uses server admin → instant confirm). */
export async function signUpWithEmail(email: string, password: string) {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  })
  const payload = (await res.json()) as {
    error?: string
    session?: {
      access_token: string
      refresh_token: string
    }
    user?: unknown
  }
  if (!res.ok || !payload.session) {
    throw new Error(payload.error || 'تعذّر إنشاء الحساب')
  }
  const supabase = createBrowserSupabaseClient()
  const { data, error } = await supabase.auth.setSession({
    access_token: payload.session.access_token,
    refresh_token: payload.session.refresh_token,
  })
  if (error) throw error
  return data
}

/** Email + password sign-in (server-backed, then browser session). */
export async function signInWithEmail(email: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  })
  const payload = (await res.json()) as {
    error?: string
    session?: {
      access_token: string
      refresh_token: string
    }
  }
  if (!res.ok || !payload.session) {
    throw new Error(payload.error || 'تعذّر تسجيل الدخول')
  }
  const supabase = createBrowserSupabaseClient()
  const { data, error } = await supabase.auth.setSession({
    access_token: payload.session.access_token,
    refresh_token: payload.session.refresh_token,
  })
  if (error) throw error
  return data
}

/** Start Google or GitHub OAuth via Supabase (optional). */
export async function signInWithOAuthProvider(provider: OAuthProvider) {
  const supabase = createBrowserSupabaseClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: getAuthRedirectTo(),
      skipBrowserRedirect: false,
      queryParams:
        provider === 'google'
          ? { access_type: 'offline', prompt: 'select_account' }
          : undefined,
    },
  })
  if (error) throw error
  return data
}

export async function signOutSupabase() {
  const supabase = createBrowserSupabaseClient()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getBrowserSession() {
  if (!isSupabaseConfigured()) return null
  const supabase = createBrowserSupabaseClient()
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getBrowserSession()
  return session?.access_token ?? null
}

/** Optional Bearer header — empty when auth is off / no session. */
export async function authHeaders(
  extra?: Record<string, string>
): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
