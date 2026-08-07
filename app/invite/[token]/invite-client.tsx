'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { authHeaders, getBrowserSession } from '@/lib/supabase/browser'

export default function InviteJoinPage() {
  const params = useParams<{ token: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const token = params.token
  const scopeHint = search.get('scope') || ''

  const [nameAr, setNameAr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const returnPath = `/invite/${token}${scopeHint ? `?scope=${encodeURIComponent(scopeHint)}` : ''}`
  const loginHref = `/auth/login?next=${encodeURIComponent(returnPath)}`

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const session = await getBrowserSession()
        if (cancelled) return
        setSignedIn(Boolean(session?.access_token))
        const metaName =
          (session?.user?.user_metadata?.full_name as string) ||
          session?.user?.email?.split('@')[0] ||
          ''
        if (metaName && !nameAr) setNameAr(metaName)
      } catch {
        if (!cancelled) setSignedIn(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed name once on mount
  }, [token])

  async function join(e: FormEvent) {
    e.preventDefault()
    if (signedIn === false) {
      router.push(loginHref)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/rooms/invites/accept', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          token,
          displayNameAr: nameAr.trim(),
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        scopeId?: string
        code?: string
      }
      if (res.status === 401 || data.code === 'AUTH_REQUIRED') {
        setError('يلزم تسجيل الدخول أولاً ثم العودة لرابط الدعوة.')
        setSignedIn(false)
        router.push(loginHref)
        return
      }
      if (!res.ok) throw new Error(data.error || 'تعذر الانضمام')
      setOkMsg(data.messageAr || 'تم الانضمام')
      const scopeId = data.scopeId || scopeHint || 'shared-demo'
      try {
        localStorage.setItem('ab-active-scope', scopeId)
        localStorage.setItem('ab-display-name', nameAr.trim())
        // Ensure invited room appears under «مساحات مشتركة» after reload.
        const { useWorkspaceStore } = await import(
          '@/lib/scopes/workspace-store'
        )
        useWorkspaceStore.getState().upsertScope({
          id: scopeId,
          nameAr:
            (data as { nameAr?: string }).nameAr ||
            (scopeId.startsWith('assoc-')
              ? 'غرفة الجمعية'
              : 'غرفة مشتركة'),
          descriptionAr: 'غرفة انضممت إليها عبر دعوة.',
          members: ['user-1'],
          memberLabelsAr: [],
          agentLabelsAr: ['وكيل١'],
          sharedMemory: [
            'انضممت عبر دعوة — ارفع ملفاً من جهازك واطلب التعديل.',
          ],
          skills: [],
        })
        useWorkspaceStore.getState().setActiveScopeId(scopeId)
      } catch {
        /* ignore */
      }
      setTimeout(() => router.push('/'), 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الانضمام')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-ab-stage px-4"
      dir="rtl"
    >
      <form
        onSubmit={(e) => void join(e)}
        className="w-full max-w-md rounded-2xl border border-ab-border bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold text-ab-ink">الانضمام للغرفة</h1>
        <ol className="mt-3 list-decimal space-y-1.5 pe-5 text-sm text-stone-600">
          <li>
            <strong className="text-ab-ink">سجّل الدخول</strong> بحسابك (Google
            أو البريد) إن لم تكن مسجّلاً.
          </li>
          <li>
            عد إلى <strong className="text-ab-ink">رابط الدعوة</strong> هذا.
          </li>
          <li>
            اكتب اسمك الظاهر ثم اضغط{' '}
            <strong className="text-ab-ink">انضم للغرفة</strong>.
          </li>
        </ol>

        {signedIn === false && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-950">
            <p className="font-semibold">الخطوة 1 مطلوبة أولاً</p>
            <p className="mt-1 text-amber-900/90">
              الانضمام يعمل فقط بعد تسجيل الدخول — ثم افتح رابط الدعوة من جديد.
            </p>
            <Link
              href={loginHref}
              className="mt-2 inline-block rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white"
            >
              سجّل الدخول الآن
            </Link>
          </div>
        )}

        {signedIn === true && (
          <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            أنت مسجّل الدخول — أكمل الاسم وانضم.
          </p>
        )}

        <label className="mt-5 block">
          <span className="mb-1 block text-xs text-stone-500">اسمك في الغرفة</span>
          <input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            required
            placeholder="مثال: أحمد"
            disabled={signedIn === false}
            className="w-full rounded-md border border-ab-border px-3 py-2 text-sm disabled:opacity-50"
          />
        </label>
        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
        {okMsg && (
          <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {okMsg}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !nameAr.trim() || signedIn === false}
          className="mt-5 w-full rounded-md bg-ab-ink py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy
            ? 'جاري الانضمام…'
            : signedIn === false
              ? 'سجّل الدخول أولاً'
              : 'انضم للغرفة'}
        </button>
      </form>
    </main>
  )
}
