'use client'

import { useCallback, useEffect, useState } from 'react'
import { Mail, Link2, RefreshCw } from 'lucide-react'
import {
  authHeaders,
  connectGoogleCalendar,
} from '@/lib/supabase/browser'
import { PERSONAL_DESK_COPY } from '@/lib/scopes/personal-desk'

type PersonalMailState = {
  connected: boolean
  unread: number
  email: string | null
  messages: Array<{
    id: string
    subject: string
    from: string
    date?: string
    snippet: string
  }>
  hintAr?: string
  messageAr?: string
  warningAr?: string
}

/**
 * Personal Gmail link for «مساحتي الشخصية» — separate from org IMAP info@.
 */
export function PersonalMailPanel({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<PersonalMailState | null>(null)
  const [loading, setLoading] = useState(false)
  const [draftNote, setDraftNote] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setDraftNote(null)
    try {
      const res = await fetch('/api/mail/personal', {
        headers: await authHeaders(),
      })
      const data = (await res.json()) as PersonalMailState & { error?: string }
      if (!res.ok) {
        setState({
          connected: false,
          unread: 0,
          email: null,
          messages: [],
          warningAr: data.error || 'تعذّر تحميل البريد الشخصي',
        })
        return
      }
      setState(data)
    } catch {
      setState({
        connected: false,
        unread: 0,
        email: null,
        messages: [],
        warningAr: 'تعذّر الاتصال',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function connect() {
    setConnecting(true)
    setDraftNote(null)
    try {
      await connectGoogleCalendar()
      await refresh()
    } catch (e) {
      setDraftNote(
        e instanceof Error ? e.message : 'تعذّر بدء ربط Google'
      )
    } finally {
      setConnecting(false)
    }
  }

  async function draftAssist(messageId: string) {
    setDraftNote(null)
    try {
      const res = await fetch('/api/mail/personal', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'draft_assist', messageId }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        draft?: { subject: string; bodyAr: string }
      }
      if (!res.ok) {
        setDraftNote(data.error || 'تعذّر إعداد المسودة')
        return
      }
      setDraftNote(
        data.draft
          ? `${data.messageAr || ''}\n\nالموضوع: ${data.draft.subject}\n\n${data.draft.bodyAr}`
          : data.messageAr || 'مسودة جاهزة'
      )
    } catch {
      setDraftNote('تعذّر إعداد المسودة')
    }
  }

  return (
    <section
      className={
        compact
          ? 'rounded-md border border-ab-border/80 bg-stone-50/80 px-2.5 py-2'
          : 'rounded-lg border border-ab-border bg-white px-3 py-3'
      }
      dir="rtl"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5 text-ab-ink/70" aria-hidden />
        <h3 className="text-[12px] font-semibold text-ab-ink">
          بريدي الشخصي
        </h3>
        {state?.connected && state.unread > 0 ? (
          <span className="rounded bg-ab-ink/10 px-1.5 py-0.5 text-[10px] font-medium text-ab-ink">
            {state.unread} غير مقروء
          </span>
        ) : null}
        <button
          type="button"
          className="ms-auto rounded p-1 text-ab-muted-soft hover:bg-stone-200 hover:text-ab-ink"
          aria-label="تحديث البريد الشخصي"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            aria-hidden
          />
        </button>
      </div>
      <p className="mb-2 text-[10px] leading-relaxed text-stone-500">
        {state?.hintAr || PERSONAL_DESK_COPY.mailOrgVsPersonalAr}
      </p>

      {!state?.connected ? (
        <button
          type="button"
          onClick={() => void connect()}
          disabled={connecting}
          className="inline-flex items-center gap-1.5 rounded-md bg-ab-ink px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-ab-ink/90 disabled:opacity-60"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          {connecting ? 'جاري الربط…' : 'ربط بريدي الشخصي (Gmail)'}
        </button>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] text-stone-600" dir="ltr">
            {state.email || 'Gmail'}
          </p>
          {state.messages.length === 0 ? (
            <p className="text-[11px] text-stone-500">
              لا رسائل غير مقروءة الآن.
            </p>
          ) : (
            <ul className="max-h-36 space-y-1 overflow-y-auto">
              {state.messages.slice(0, 6).map((m) => (
                <li
                  key={m.id}
                  className="rounded border border-ab-border/60 bg-white px-2 py-1.5"
                >
                  <p className="truncate text-[11px] font-medium text-ab-ink">
                    {m.subject || 'بدون موضوع'}
                  </p>
                  <p className="truncate text-[10px] text-stone-500">
                    {m.from}
                  </p>
                  <button
                    type="button"
                    className="mt-1 text-[10px] text-ab-ink underline-offset-2 hover:underline"
                    onClick={() => void draftAssist(m.id)}
                  >
                    مساعدة مسودة رد
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => void connect()}
            className="text-[10px] text-stone-500 hover:text-ab-ink"
          >
            ربط حساب Google إضافي
          </button>
        </div>
      )}

      {state?.warningAr ? (
        <p className="mt-2 text-[10px] text-amber-800">{state.warningAr}</p>
      ) : null}
      {draftNote ? (
        <pre
          dir="rtl"
          className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-ab-border/60 bg-white p-2 text-[10px] text-ab-ink"
        >
          {draftNote}
        </pre>
      ) : null}
    </section>
  )
}
