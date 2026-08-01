'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createBrowserSupabaseClient,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'

/**
 * Client-side OAuth callback (PKCE).
 * Exchanges `?code=` for a browser session after Google / Apple redirect.
 * When `?calendar=1`, persists Google provider tokens for Calendar APIs.
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState('جاري إكمال تسجيل الدخول…')

  useEffect(() => {
    async function finish() {
      if (!isSupabaseConfigured()) {
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
        const providerToken = (
          session as { provider_token?: string } | null
        )?.provider_token
        const refresh = (
          session as { provider_refresh_token?: string } | null
        )?.provider_refresh_token

        if (session?.access_token && providerToken) {
          setMessage(
            wantCalendar
              ? 'جاري حفظ صلاحيات Google (تقويم / Drive)…'
              : 'جاري حفظ جلسة Google…'
          )
          await fetch('/api/google/calendar', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              action: 'save-tokens',
              accessToken: providerToken,
              refreshToken: refresh || null,
              email: session.user.email,
              expiresAt: new Date(Date.now() + 3500_000).toISOString(),
              scopes: wantCalendar
                ? 'calendar,gmail.readonly,drive.readonly'
                : 'login',
            }),
          })
        }

        router.replace(wantCalendar ? '/?calendar=connected' : '/')
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
