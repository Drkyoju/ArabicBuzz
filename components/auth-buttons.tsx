'use client'

import { useEffect, useState } from 'react'
import {
  getBrowserSession,
  isSupabaseConfigured,
  signInWithOAuthProvider,
  signOutSupabase,
  type OAuthProvider,
} from '@/lib/supabase/browser'
import type { User } from '@supabase/supabase-js'

export function AuthButtons({ compact = false }: { compact?: boolean }) {
  const [user, setUser] = useState<User | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const configured = isSupabaseConfigured()

  useEffect(() => {
    if (!configured) return
    void getBrowserSession()
      .then((s) => setUser(s?.user ?? null))
      .catch(() => setUser(null))
  }, [configured])

  async function start(provider: OAuthProvider) {
    setError('')
    setBusy(provider)
    try {
      await signInWithOAuthProvider(provider)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر بدء تسجيل الدخول')
      setBusy(null)
    }
  }

  async function logout() {
    setBusy('out')
    try {
      await signOutSupabase()
      setUser(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تسجيل الخروج')
    } finally {
      setBusy(null)
    }
  }

  if (!configured) {
    return (
      <p className="text-xs text-stone-500">
        فعّل Supabase عبر NEXT_PUBLIC_SUPABASE_URL و
        NEXT_PUBLIC_SUPABASE_ANON_KEY، ثم فعّل مزوّدي Google و GitHub في لوحة
        Supabase.
      </p>
    )
  }

  if (user) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-ab-ink">
          مرحباً، {user.email || user.user_metadata?.full_name || 'مستخدم'}
        </p>
        <button
          type="button"
          disabled={busy === 'out'}
          onClick={() => void logout()}
          className="rounded-md border border-ab-border bg-white px-3 py-2 text-sm disabled:opacity-40"
        >
          تسجيل الخروج
        </button>
      </div>
    )
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void start('google')}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-ab-border bg-white px-3 py-2.5 text-sm font-medium text-ab-ink disabled:opacity-40"
      >
        {busy === 'google' ? 'جاري التحويل…' : 'تسجيل الدخول عبر Google'}
      </button>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void start('github')}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-ab-ink px-3 py-2.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {busy === 'github' ? 'جاري التحويل…' : 'تسجيل الدخول عبر GitHub'}
      </button>
      {error && <p className="text-xs text-ab-warn">{error}</p>}
    </div>
  )
}
