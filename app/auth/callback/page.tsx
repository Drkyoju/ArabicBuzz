'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createBrowserSupabaseClient,
  ensureSupabaseBrowserConfig,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'
import { persistGoogleProviderTokens } from '@/lib/google/persist-provider-tokens'
import { GOOGLE_WORKSPACE_SCOPE_TAGS } from '@/lib/google/scopes'

/**
 * Client-side OAuth callback (PKCE).
 * Exchanges `?code=` for a browser session after Google / GitHub / email redirect.
 * When `?calendar=1`, persists Google provider tokens for Calendar/Drive APIs.
 * Display name from Google is persisted server-side via `/api/me/role`.
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState('جاري إكمال تسجيل الدخول…')

  useEffect(() => {
    async function finish() {
      const ready = await ensureSupabaseBrowserConfig()
      if (!ready || !isSupabaseConfigured()) {
        setMessage('Supabase غير مُعدّ.')
        router.replace('/auth/login?error=supabase_not_configured')
        return
      }
      try {
        const supabase = createBrowserSupabaseClient()
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const wantCalendar =
          url.searchParams.get('calendar') === '1' ||
          url.searchParams.get('calendar') === 'true'
        const err = url.searchParams.get('error_description')
        if (err) {
          router.replace(`/auth/login?error=${encodeURIComponent(err)}`)
          return
        }
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            router.replace(
              `/auth/login?error=${encodeURIComponent(error.message)}`
            )
            return
          }
        } else {
          await supabase.auth.getSession()
        }

        const { data } = await supabase.auth.getSession()
        const session = data.session
        const hasProvider = Boolean(
          (session as { provider_token?: string } | null)?.provider_token
        )

        // Only persist Calendar/Gmail/Drive tokens when this was a workspace link.
        if (session?.access_token && hasProvider && wantCalendar) {
          setMessage('جاري حفظ صلاحيات Google (تقويم / Drive)…')
          await persistGoogleProviderTokens(
            session,
            GOOGLE_WORKSPACE_SCOPE_TAGS
          )
        }

        // Sync org role + persist Google display name (server).
        if (session?.access_token) {
          try {
            await fetch('/api/me/role', {
              headers: { Authorization: `Bearer ${session.access_token}` },
            })
          } catch {
            /* non-fatal — sidebar will retry */
          }
        }

        let nextPath = '/'
        try {
          const stored = sessionStorage.getItem('ab-auth-next')
          if (
            stored &&
            stored.startsWith('/') &&
            !stored.startsWith('//')
          ) {
            nextPath = stored
            sessionStorage.removeItem('ab-auth-next')
          }
        } catch {
          /* ignore */
        }
        if (wantCalendar && nextPath === '/') {
          router.replace('/?calendar=connected')
        } else {
          router.replace(nextPath)
        }
      } catch (e) {
        router.replace(
          `/auth/login?error=${encodeURIComponent(
            e instanceof Error ? e.message : 'auth_failed'
          )}`
        )
      }
    }
    void finish()
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center p-8" dir="rtl">
      <p className="text-sm text-stone-600">{message}</p>
    </main>
  )
}
