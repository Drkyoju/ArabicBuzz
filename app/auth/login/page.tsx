'use client'

import { AuthButtons } from '@/components/auth-buttons'
import Link from 'next/link'

/**
 * Login — Google first, email optional. Demo demoted when enabled.
 */
export default function LoginPage() {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-bl from-stone-100 via-white to-emerald-50/40 px-4 py-12"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-2xl border border-ab-border bg-ab-surface p-6 shadow-sm">
        <h1 className="text-xl font-bold text-ab-ink">Arabic Buzz</h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          سجّل الدخول بحساب Google — بعد الدخول تقدر تشتغل في الغرفة مع فريقك.
        </p>
        <div className="mt-6">
          <AuthButtons />
        </div>
        <p className="mt-6 text-center text-xs text-stone-500">
          <Link href="/" className="text-ab-accent underline">
            العودة إلى مساحة العمل
          </Link>
        </p>
      </div>
    </main>
  )
}
