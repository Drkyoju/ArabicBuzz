import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authCallbackUrl } from '@/lib/app-url'
import {
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_LOGIN_SCOPES,
} from '@/lib/google/scopes'
import {
  applyBrowserPublicConfig,
  readBrowserPublicConfig,
  type AbPublicConfig,
} from '@/lib/public-runtime-config'

function publicSupabaseConfig() {
  const runtime = readBrowserPublicConfig()
  if (runtime) {
    return { url: runtime.supabaseUrl, anonKey: runtime.supabaseAnonKey }
  }
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

/** Load public Supabase config when Docker build omitted NEXT_PUBLIC_* inlining. */
export async function ensureSupabaseBrowserConfig(): Promise<boolean> {
  if (isSupabaseConfigured()) return true
  if (typeof window === 'undefined') return false
  try {
    const res = await fetch('/api/public-config', { cache: 'no-store' })
    if (!res.ok) return false
    const data = (await res.json()) as {
      supabaseUrl?: string | null
      supabaseAnonKey?: string | null
      appUrl?: string | null
      supabaseConfigured?: boolean
    }
    const url = (data.supabaseUrl || '').trim()
    const anon = (data.supabaseAnonKey || '').trim()
    if (!url || !anon) return false
    const cfg: AbPublicConfig = {
      supabaseUrl: url,
      supabaseAnonKey: anon,
      appUrl: (data.appUrl || '').trim(),
    }
    applyBrowserPublicConfig(cfg)
    browserClient = null
    // Prefer runtime window config even if build inlined empty NEXT_PUBLIC_*.
    return Boolean(
      readBrowserPublicConfig()?.supabaseUrl &&
        readBrowserPublicConfig()?.supabaseAnonKey
    )
  } catch {
    return false
  }
}

let browserClient: SupabaseClient | null = null

/** Browser Supabase client (email + optional OAuth) — singleton for one session. */
export function createBrowserSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient
  const { url, anonKey } = publicSupabaseConfig()
  if (!url || !anonKey) {
    throw new Error(
      'Supabase غير مُعدّ. اضبط NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }
  browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
  return browserClient
}

export type OAuthProvider = 'google' | 'github'

export function getAuthRedirectTo() {
  return authCallbackUrl()
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

/**
 * Sign in with Google (identity only) or GitHub.
 * Google login deliberately omits Calendar/Gmail/Drive — those trigger Google’s
 * “unverified app” warnings. Link workspace APIs via `connectGoogleCalendar()`.
 */
export async function signInWithOAuthProvider(provider: OAuthProvider) {
  if (provider === 'google') {
    return signInWithGoogleIdentity()
  }
  const supabase = createBrowserSupabaseClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: getAuthRedirectTo(),
      skipBrowserRedirect: false,
    },
  })
  if (error) throw error
  return data
}

/** Google sign-in with openid/email/profile only — no sensitive API scopes. */
export async function signInWithGoogleIdentity() {
  const supabase = createBrowserSupabaseClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAuthRedirectTo(),
      skipBrowserRedirect: false,
      scopes: GOOGLE_LOGIN_SCOPES,
      queryParams: {
        // Account picker only — do NOT force consent (avoids scary re-prompts).
        prompt: 'select_account',
      },
    },
  })
  if (error) throw error
  return data
}

/**
 * Google OAuth with Calendar + Gmail + Drive (after the user is already signed in).
 * Uses select_account so you can link additional emails without overwriting login.
 * Expect Google verification warnings until the Cloud project is verified.
 */
export async function connectGoogleCalendar() {
  const supabase = createBrowserSupabaseClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${getAuthRedirectTo()}?calendar=1`,
      skipBrowserRedirect: false,
      scopes: GOOGLE_CALENDAR_SCOPES,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent select_account',
        include_granted_scopes: 'true',
      },
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
  try {
    const token = await Promise.race([
      getAccessToken(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ])
    return {
      ...(extra || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  } catch {
    return { ...(extra || {}) }
  }
}
