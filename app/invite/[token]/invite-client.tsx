'use client'

import { FormEvent, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

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

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/rooms/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          displayNameAr: nameAr.trim(),
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        scopeId?: string
      }
      if (!res.ok) throw new Error(data.error || 'تعذر الانضمام')
      setOkMsg(data.messageAr || 'تم الانضمام')
      const scopeId = data.scopeId || scopeHint || 'shared-demo'
      try {
        localStorage.setItem('ab-active-scope', scopeId)
        localStorage.setItem('ab-display-name', nameAr.trim())
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
        <p className="mt-1 text-sm text-stone-500">
          تمت دعوتك عبر رابط. اكتب الاسم الذي سيظهر للفريق ثم انضم.
        </p>
        <label className="mt-5 block">
          <span className="mb-1 block text-xs text-stone-500">اسمك في الغرفة</span>
          <input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            required
            placeholder="مثال: أحمد"
            className="w-full rounded-md border border-ab-border px-3 py-2 text-sm"
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
          disabled={busy || !nameAr.trim()}
          className="mt-5 w-full rounded-md bg-ab-ink py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'جاري الانضمام…' : 'انضم للغرفة'}
        </button>
      </form>
    </main>
  )
}
