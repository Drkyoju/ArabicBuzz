'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { WorkspaceShell } from '@/components/workspace-shell'
import { useCanvasStore } from '@/lib/canvas/store'
import {
  getBrowserSession,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'
import { AuthButtons } from '@/components/auth-buttons'

export default function HomePage() {
  const upsertArtifact = useCanvasStore((s) => s.upsertArtifact)
  const [airGapped, setAirGapped] = useState(false)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured())
  const [signedIn, setSignedIn] = useState(!isSupabaseConfigured())

  useEffect(() => {
    upsertArtifact({
      id: 'nizam-sarf',
      type: 'code',
      titleAr: 'نظام_الصرف.py',
      language: 'python',
      content:
        'def summarize_decisions(items):\n    return {"count": len(items), "lang": "ar"}\n',
      isEditing: false,
    })
    void fetch('/api/security/airgap')
      .then((r) => r.json())
      .then((d) => setAirGapped(Boolean(d.airGapped)))
      .catch(() => setAirGapped(false))
  }, [upsertArtifact])

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuthReady(true)
      setSignedIn(true)
      return
    }
    void getBrowserSession()
      .then((s) => {
        setSignedIn(Boolean(s?.user))
        setAuthReady(true)
      })
      .catch(() => {
        setSignedIn(false)
        setAuthReady(true)
      })
  }, [])

  if (!authReady) {
    return (
      <main
        className="flex min-h-screen items-center justify-center text-sm text-stone-500"
        dir="rtl"
      >
        جارٍ التحقق من الجلسة…
      </main>
    )
  }

  if (!signedIn) {
    return (
      <main
        className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12"
        dir="rtl"
      >
        <h1 className="mb-2 text-2xl font-bold text-ab-ink">Arabic Buzz</h1>
        <p className="mb-6 text-sm text-stone-600">
          غرفة عمل عربية حيث يعمل البشر والوكلاء معاً — مساحات شخصية ومشتركة،
          موافقات بشرية، ونماذج مشتركة للفريق.
        </p>
        <AuthButtons />
        <p className="mt-6 text-center text-xs text-stone-500">
          أو افتح{' '}
          <Link href="/auth/login" className="underline">
            صفحة تسجيل الدخول
          </Link>
        </p>
      </main>
    )
  }

  return (
    <main>
      <WorkspaceShell airGapped={airGapped} />
    </main>
  )
}
