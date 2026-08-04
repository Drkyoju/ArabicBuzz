'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

type InboxThread = {
  id: string
  requesterPhone: string
  summaryAr: string
  ownerQuestionAr: string | null
  intentKind: string
  updatedAt: string
}

/**
 * Pending WhatsApp inbox threads awaiting owner reply.
 */
export function WhatsAppInboxPanel({
  compact,
  hideRefresh,
}: {
  compact?: boolean
  /** When true, omit the refresh control (parent already refreshes). */
  hideRefresh?: boolean
}) {
  const activeScopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [threads, setThreads] = useState<InboxThread[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const h = await authHeaders()
      const res = await fetch(
        `/api/whatsapp/inbox?scopeId=${encodeURIComponent(activeScopeId)}`,
        { headers: h }
      )
      const data = (await res.json()) as {
        threads?: InboxThread[]
        error?: string
      }
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
        setThreads([])
        return
      }
      setThreads(data.threads || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ')
      setThreads([])
    } finally {
      setLoading(false)
    }
  }, [activeScopeId])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 10000)
    return () => clearInterval(t)
  }, [load])

  async function reply(threadId: string) {
    const answerAr = (answers[threadId] || '').trim()
    if (!answerAr) return
    setBusyId(threadId)
    try {
      const h = await authHeaders({ 'Content-Type': 'application/json' })
      const res = await fetch('/api/whatsapp/inbox', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          threadId,
          answerAr,
          scopeId: activeScopeId,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error || 'تعذّر الإرسال')
        return
      }
      setAnswers((prev) => {
        const next = { ...prev }
        delete next[threadId]
        return next
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ')
    } finally {
      setBusyId(null)
    }
  }

  if (compact && threads.length === 0 && !loading) return null

  return (
    <div
      className={
        compact
          ? 'border-b border-amber-200/80 bg-amber-50/90 px-4 py-2'
          : 'rounded-xl border border-ab-border bg-ab-surface p-4'
      }
      dir="rtl"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-950">
          <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
          وارد واتساب معلّق
          {threads.length > 0 ? ` (${threads.length})` : ''}
        </p>
        {!hideRefresh && (
          <button
            type="button"
            onClick={() => void load()}
            className="text-[11px] text-amber-800 underline-offset-2 hover:underline"
          >
            تحديث
          </button>
        )}
      </div>
      {loading && threads.length === 0 && (
        <p className="text-xs text-stone-500">جاري التحميل…</p>
      )}
      {error && <p className="mb-2 text-xs text-ab-warn">{error}</p>}
      {!loading && threads.length === 0 && !error && (
        <p className="text-xs text-stone-500">لا طلبات معلّقة حالياً.</p>
      )}
      <ul className="space-y-3">
        {threads.map((t) => (
          <li
            key={t.id}
            className="rounded-lg border border-amber-200/60 bg-white/80 p-2.5 text-xs"
          >
            <p className="font-medium text-ab-ink">
              {t.summaryAr || 'طلب واتساب'}
            </p>
            <p className="mt-0.5 text-[11px] text-stone-500" dir="ltr">
              من {t.requesterPhone} · #{t.id.slice(0, 8)}
            </p>
            {t.ownerQuestionAr && (
              <p className="mt-1.5 text-stone-700">{t.ownerQuestionAr}</p>
            )}
            <div className="mt-2 flex flex-col gap-1.5 sm:flex-row">
              <input
                type="text"
                value={answers[t.id] || ''}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [t.id]: e.target.value }))
                }
                placeholder="ردك للمواصلة…"
                className="min-w-0 flex-1 rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs"
                disabled={busyId === t.id}
              />
              <button
                type="button"
                disabled={busyId === t.id || !(answers[t.id] || '').trim()}
                onClick={() => void reply(t.id)}
                className="rounded-md bg-ab-ink px-3 py-1.5 text-xs text-white disabled:opacity-40"
              >
                {busyId === t.id ? '…' : 'أرسل وردّ'}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-stone-400">
              أو من المحادثة: رد واتساب: …
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
