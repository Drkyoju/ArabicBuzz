'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { AuthButtons } from '@/components/auth-buttons'
import Link from 'next/link'

const NEXT_KEY = 'ab-auth-next'

function safeNextPath(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}

function LoginInner() {
  const search = useSearchParams()
  const next = safeNextPath(search.get('next'))

  useEffect(() => {
    try {
      if (next) sessionStorage.setItem(NEXT_KEY, next)
      else sessionStorage.removeItem(NEXT_KEY)
    } catch {
      /* ignore */
    }
  }, [next])

  return (
    <div className="w-full max-w-md rounded-2xl border border-ab-border bg-ab-surface p-6 shadow-sm">
      <h1 className="text-xl font-bold text-ab-ink">Arabic Buzz</h1>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        سجّل الدخول بحساب Google — بعد الدخول تقدر تشتغل في الغرفة مع فريقك.
      </p>
      {next?.startsWith('/invite/') && (
        <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          بعد تسجيل الدخول سنعيدك لرابط الدعوة لإكمال الانضمام.
        </p>
      )}
      <div className="mt-6">
        <AuthButtons />
      </div>
      <p className="mt-6 text-center text-xs text-stone-500">
        <Link href={next || '/'} className="text-ab-accent underline">
          {next?.startsWith('/invite/')
            ? 'العودة لرابط الدعوة'
            : 'العودة إلى مساحة العمل'}
        </Link>
      </p>
    </div>
  )
}

/**
 * Login — Google first, email optional. Demo demoted when enabled.
 * Supports `?next=/invite/...` so teammates return to the invite after auth.
 */
export default function LoginPage() {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-bl from-stone-100 via-white to-emerald-50/40 px-4 py-12"
      dir="rtl"
    >
      <Suspense
        fallback={
          <p className="text-sm text-stone-500">جاري تحميل صفحة الدخول…</p>
        }
      >
        <LoginInner />
      </Suspense>
    </main>
  )
}
