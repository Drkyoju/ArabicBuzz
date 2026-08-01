'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AuthButtons } from '@/components/auth-buttons'

function LoginBody() {
  const params = useSearchParams()
  const error = params.get('error')

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12" dir="rtl">
      <h1 className="mb-2 text-2xl font-bold text-ab-ink">Arabic Buzz</h1>
      <p className="mb-8 text-sm text-stone-600">
        سجّل الدخول للمتابعة إلى منصة الوكلاء الذكية.
      </p>
      {error && (
        <p className="mb-4 rounded-md border border-ab-warn/30 bg-ab-warn/10 px-3 py-2 text-sm text-ab-warn">
          {decodeURIComponent(error)}
        </p>
      )}
      <AuthButtons />
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-8 text-center">جارٍ التحميل…</main>}>
      <LoginBody />
    </Suspense>
  )
}
