'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getBrowserSession,
  isSupabaseConfigured,
  sendEmailOtp,
  signInWithOAuthProvider,
  signOutSupabase,
  verifyEmailOtp,
  createBrowserSupabaseClient,
  type OAuthProvider,
} from '@/lib/supabase/browser'
import { persistGoogleProviderTokens } from '@/lib/google/persist-provider-tokens'
import type { User } from '@supabase/supabase-js'

export function AuthButtons({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [showEmail, setShowEmail] = useState(false)
  const [demoEnabled, setDemoEnabled] = useState(false)
  const configured = isSupabaseConfigured()

  // The demo endpoint returns DEMO_DISABLED unless ALLOW_DEMO_LOGIN=true, so
  // only render the button when the server actually accepts it.
  useEffect(() => {
    let cancelled = false
    void fetch('/api/integrations/status')
      .then((r) => r.json())
      .then((d: { demoLoginEnabled?: boolean }) => {
        if (!cancelled) setDemoEnabled(Boolean(d.demoLoginEnabled))
      })
      .catch(() => {
        if (!cancelled) setDemoEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!configured) return
    let cancelled = false
    const sb = createBrowserSupabaseClient()
    void (async () => {
      try {
        const s = await Promise.race([
          getBrowserSession(),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 2500)
          ),
        ])
        if (cancelled) return
        setUser(s?.user ?? null)
        // If OAuth landed on /auth/login instead of /auth/callback,
        // still persist Calendar/Drive tokens when present.
        if (
          s &&
          (s as { provider_token?: string }).provider_token &&
          s.user?.app_metadata?.provider === 'google'
        ) {
          await persistGoogleProviderTokens(s)
        }
      } catch {
        if (!cancelled) setUser(null)
      }
    })()
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setUser(session?.user ?? null)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [configured])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error') || params.get('error_description')
    if (!err) return
    setError(decodeURIComponent(err.replace(/\+/g, ' ')))
    params.delete('error')
    params.delete('error_description')
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`
    window.history.replaceState({}, '', next)
  }, [])

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!email.trim().includes('@')) {
      setError('أدخل بريداً إلكترونياً صالحاً.')
      return
    }
    setBusy('send')
    try {
      const result = await sendEmailOtp(email)
      setInfo(result.messageAr || 'تم إرسال الرمز إلى بريدك.')
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إرسال الرمز')
    } finally {
      setBusy(null)
    }
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (code.trim().length < 4) {
      setError('أدخل الرمز الذي وصلك في البريد.')
      return
    }
    setBusy('verify')
    try {
      await verifyEmailOtp(email, code)
      setUser((await getBrowserSession())?.user ?? null)
      router.replace('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'الرمز غير صحيح')
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

  async function demoLogin() {
    setError('')
    setInfo('')
    setBusy('demo')
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        session?: { access_token: string; refresh_token: string }
      }
      if (!res.ok || !data.session) {
        throw new Error(data.error || 'تعذّر الدخول التجريبي')
      }
      const supabase = createBrowserSupabaseClient()
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
      if (sessionError) throw sessionError
      setUser((await getBrowserSession())?.user ?? null)
      setInfo(data.messageAr || 'تم الدخول التجريبي')
      router.replace('/')
      router.refresh()
      // Hard navigation so home auth gate re-reads session cookies
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional full reload after setSession
      window.location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الدخول التجريبي')
    } finally {
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
        تسجيل الدخول غير جاهز بعد — راجع إعدادات الحساب مع المسؤول.
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
        onClick={() => void startOauth('google')}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-ab-accent px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy === 'google'
          ? 'جاري التحويل إلى Google…'
          : 'سجّل الدخول بحساب Google'}
      </button>
      <p className="text-[11px] font-medium text-emerald-800">موصى به</p>
      <p className="text-[11px] leading-relaxed text-stone-500">
        بعد الدخول تقدر تشتغل في الغرفة — وتربط التقويم والملفات إن احتجت.
      </p>

      <button
        type="button"
        className="w-full rounded-md border border-ab-border bg-white px-3 py-2 text-xs text-ab-ink"
        onClick={() => setShowEmail((v) => !v)}
      >
        {showEmail ? 'إخفاء الدخول بالبريد' : 'أو الدخول برمز إلى البريد'}
      </button>

      {showEmail && (
        <>
        <p className="text-xs text-stone-500">
          أدخل بريدك → يصلك رمز في الرسالة → أدخله هنا للدخول.
        </p>

        {step === 'email' ? (
          <form className="space-y-2" onSubmit={(e) => void sendCode(e)}>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="بريدك@مثال.sa"
              className="w-full rounded-md border border-ab-border bg-white px-3 py-2.5 text-sm outline-none ring-ab-accent focus:ring-2"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={Boolean(busy)}
              className="flex w-full items-center justify-center rounded-md bg-ab-accent px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy === 'send' ? 'جاري الإرسال…' : 'أرسل رمز الدخول إلى بريدي'}
            </button>
          </form>
        ) : (
          <form className="space-y-2" onSubmit={(e) => void confirmCode(e)}>
            <p className="text-xs text-stone-600" dir="ltr">
              {email}
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="الرمز من البريد (مثل 123456)"
              className="w-full rounded-md border border-ab-border bg-white px-3 py-2.5 text-center text-lg tracking-widest outline-none ring-ab-accent focus:ring-2"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={Boolean(busy)}
              className="flex w-full items-center justify-center rounded-md bg-ab-accent px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy === 'verify' ? 'جاري التحقق…' : 'تأكيد والدخول'}
            </button>
            <button
              type="button"
              className="w-full text-xs text-stone-500 underline"
              onClick={() => {
                setStep('email')
                setCode('')
                setInfo('')
                setError('')
              }}
            >
              تغيير البريد أو إعادة الإرسال
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              className="w-full text-xs text-ab-accent"
              onClick={() => {
                void (async () => {
                  setError('')
                  setBusy('send')
                  try {
                    const result = await sendEmailOtp(email)
                    setInfo(result.messageAr || 'أُعيد إرسال الرمز.')
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : 'تعذّر إعادة الإرسال'
                    )
                  } finally {
                    setBusy(null)
                  }
                })()
              }}
            >
              إعادة إرسال الرمز
            </button>
          </form>
        )}
        </>
      )}

      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void startOauth('github')}
        className="w-full text-center text-[11px] text-stone-400 underline disabled:opacity-40"
      >
        الدخول بحساب GitHub
      </button>

      {demoEnabled && (
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void demoLogin()}
          className="w-full text-center text-[10px] text-stone-400 underline disabled:opacity-40"
        >
          {busy === 'demo' ? 'جاري الدخول…' : 'دخول تجريبي (للاختبار فقط)'}
        </button>
      )}

      {info && <p className="text-xs text-ab-accent">{info}</p>}
      {error && <p className="text-xs text-ab-warn">{error}</p>}
    </div>
  )
}
