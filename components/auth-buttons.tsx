'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getBrowserSession,
  isSupabaseConfigured,
  signInWithEmail,
  signInWithOAuthProvider,
  signOutSupabase,
  signUpWithEmail,
  type OAuthProvider,
} from '@/lib/supabase/browser'
import type { User } from '@supabase/supabase-js'

export function AuthButtons({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showOauth, setShowOauth] = useState(false)
  const configured = isSupabaseConfigured()

  useEffect(() => {
    if (!configured) return
    void getBrowserSession()
      .then((s) => setUser(s?.user ?? null))
      .catch(() => setUser(null))
  }, [configured])

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!email.trim() || password.length < 6) {
      setError('أدخل بريداً صالحاً وكلمة مرور من 6 أحرف على الأقل.')
      return
    }
    setBusy('email')
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password)
        setUser((await getBrowserSession())?.user ?? null)
        router.replace('/')
        router.refresh()
      } else {
        const data = await signUpWithEmail(email, password)
        if (data.session) {
          setUser(data.session.user)
          router.replace('/')
          router.refresh()
        } else {
          setInfo(
            'تم إنشاء الحساب. إن كان تأكيد البريد مفعّلاً في Supabase، افتح رابط التأكيد ثم سجّل الدخول.'
          )
          setMode('signin')
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'تعذّر تسجيل الدخول بالبريد'
      )
    } finally {
      setBusy(null)
    }
  }

  async function startOauth(provider: OAuthProvider) {
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
      router.replace('/auth/login')
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
        NEXT_PUBLIC_SUPABASE_ANON_KEY، وتأكد أن مزوّد Email مفعّل في لوحة
        Authentication.
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
      <div className="mb-1 flex gap-2 text-xs">
        <button
          type="button"
          className={
            mode === 'signin'
              ? 'font-semibold text-ab-accent'
              : 'text-stone-500'
          }
          onClick={() => setMode('signin')}
        >
          تسجيل الدخول
        </button>
        <span className="text-stone-300">|</span>
        <button
          type="button"
          className={
            mode === 'signup'
              ? 'font-semibold text-ab-accent'
              : 'text-stone-500'
          }
          onClick={() => setMode('signup')}
        >
          إنشاء حساب
        </button>
      </div>

      <form className="space-y-2" onSubmit={(e) => void submitEmail(e)}>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="البريد الإلكتروني"
          className="w-full rounded-md border border-ab-border bg-white px-3 py-2.5 text-sm outline-none ring-ab-accent focus:ring-2"
          dir="ltr"
        />
        <input
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="كلمة المرور (٦ أحرف على الأقل)"
          className="w-full rounded-md border border-ab-border bg-white px-3 py-2.5 text-sm outline-none ring-ab-accent focus:ring-2"
          dir="ltr"
        />
        <button
          type="submit"
          disabled={Boolean(busy)}
          className="flex w-full items-center justify-center rounded-md bg-ab-accent px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy === 'email'
            ? 'جاري…'
            : mode === 'signin'
              ? 'دخول بالبريد'
              : 'إنشاء حساب بالبريد'}
        </button>
      </form>

      <button
        type="button"
        className="text-xs text-stone-500 underline"
        onClick={() => setShowOauth((v) => !v)}
      >
        {showOauth ? 'إخفاء خيارات أخرى' : 'أو استخدم Google / GitHub'}
      </button>

      {showOauth && (
        <div className="space-y-2">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void startOauth('google')}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-ab-border bg-white px-3 py-2.5 text-sm font-medium text-ab-ink disabled:opacity-40"
          >
            {busy === 'google' ? 'جاري التحويل…' : 'Google'}
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void startOauth('github')}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-ab-border bg-white px-3 py-2.5 text-sm font-medium text-ab-ink disabled:opacity-40"
          >
            {busy === 'github' ? 'جاري التحويل…' : 'GitHub'}
          </button>
        </div>
      )}

      {info && <p className="text-xs text-ab-accent">{info}</p>}
      {error && <p className="text-xs text-ab-warn">{error}</p>}
    </div>
  )
}
