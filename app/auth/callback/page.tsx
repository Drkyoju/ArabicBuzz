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
          // Implicit / hash fragment flows
          await supabase.auth.getSession()
        }
        router.replace('/')
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
