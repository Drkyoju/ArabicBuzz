'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Login disabled — redirect straight into the workspace. */
export default function LoginPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/')
  }, [router])
  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-stone-500" dir="rtl">
      جارٍ فتح المنصة…
    </main>
  )
}
