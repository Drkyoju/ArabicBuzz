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
  type OAuthProvider,
} from '@/lib/supabase/browser'
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
  const [showOauth, setShowOauth] = useState(false)
  const configured = isSupabaseConfigured()

  useEffect(() => {
    if (!configured) return
    void getBrowserSession()
      .then((s) => setUser(s?.user ?? null))
      .catch(() => setUser(null))
  }, [configured])

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
        NEXT_PUBLIC_SUPABASE_ANON_KEY.
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
            placeholder="you@company.com"
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

      <button
        type="button"
        className="text-xs text-stone-500 underline"
        onClick={() => setShowOauth((v) => !v)}
      >
        {showOauth ? 'إخفاء' : 'أو Google / GitHub'}
      </button>

      {showOauth && (
        <div className="space-y-2">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void startOauth('google')}
            className="flex w-full items-center justify-center rounded-md border border-ab-border bg-white px-3 py-2.5 text-sm disabled:opacity-40"
          >
            Google
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void startOauth('github')}
            className="flex w-full items-center justify-center rounded-md border border-ab-border bg-white px-3 py-2.5 text-sm disabled:opacity-40"
          >
            GitHub
          </button>
        </div>
      )}

      {info && <p className="text-xs text-ab-accent">{info}</p>}
      {error && <p className="text-xs text-ab-warn">{error}</p>}
    </div>
  )
}
