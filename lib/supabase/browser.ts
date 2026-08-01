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

/** Email + password sign-in. */
export async function signInWithEmail(email: string, password: string) {
  const supabase = createBrowserSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw error
  return data
}

/** Email + password registration. */
export async function signUpWithEmail(email: string, password: string) {
  const supabase = createBrowserSupabaseClient()
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: getAuthRedirectTo(),
    },
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
