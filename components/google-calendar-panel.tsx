'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Link2, Loader2, Mail, Unlink } from 'lucide-react'
import {
  authHeaders,
  connectGoogleCalendar,
  getBrowserSession,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'

type CalStatus = {
  connected?: boolean
  email?: string | null
  error?: string
}

type EventRow = {
  id: string
  summary: string
  start?: string
  end?: string
  htmlLink?: string
  location?: string
}

type MeetingRow = {
  id: string
  subject: string
  from: string
  snippet: string
  zoomUrl?: string
  dateHint?: string
}

export function GoogleCalendarPanel() {
  const [status, setStatus] = useState<CalStatus | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const refresh = useCallback(async () => {
    setBusy(true)
    setNote('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/google/calendar?action=status', { headers })
      const data = (await res.json()) as CalStatus
      setStatus(data)
      if (data.connected) {
        const ev = await fetch('/api/google/calendar?action=events&max=8', {
          headers,
        })
        const payload = (await ev.json()) as { events?: EventRow[]; error?: string }
        if (ev.ok) setEvents(payload.events || [])
        else setNote(payload.error || 'تعذّر جلب المواعيد')
      } else {
        setEvents([])
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'خطأ في التقويم')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function connect() {
    setBusy(true)
    setNote('')
    try {
      if (!isSupabaseConfigured()) {
        setNote('Supabase غير مُعدّ — لا يمكن ربط Google.')
        return
      }
      await connectGoogleCalendar()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل بدء الربط')
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/google/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'disconnect' }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'فشل الفصل')
      setStatus({ connected: false })
      setEvents([])
      setMeetings([])
      setNote('تم فصل تقويم Google.')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل الفصل')
    } finally {
      setBusy(false)
    }
  }

  async function scanMail() {
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/google/calendar?action=scan-email', {
        headers: await authHeaders(),
      })
      const data = (await res.json()) as {
        meetings?: MeetingRow[]
        error?: string
      }
      if (!res.ok) throw new Error(data.error || 'فشل المسح')
      setMeetings(data.meetings || [])
      setNote(
        data.meetings?.length
          ? `عُثر على ${data.meetings.length} رسالة — أضفها من الدردشة أو أنشئ الموعد يدوياً.`
          : 'لا دعوات واضحة في البريد الأخير.'
      )
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل مسح البريد')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const session = await getBrowserSession()
        const providerToken = (
          session as { provider_token?: string } | null
        )?.provider_token
        const providerRefresh = (
          session as { provider_refresh_token?: string } | null
        )?.provider_refresh_token
        if (!providerToken || !session?.user?.id) return
        await fetch('/api/google/calendar', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            action: 'save-tokens',
            accessToken: providerToken,
            refreshToken: providerRefresh || null,
            email: session.user.email,
            expiresAt: new Date(Date.now() + 3500_000).toISOString(),
            scopes: 'calendar',
          }),
        })
        await refresh()
      } catch {
        /* ignore */
      }
    })()
  }, [refresh])

  return (
    <div dir="rtl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <CalendarDays className="h-4 w-4 text-ab-accent" aria-hidden />
            تقويم Google · Zoom والتذكيرات
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            اربط حساب Google لإضافة مواعيد وجلسات Zoom من الدردشة، ومزامنة
            الدعوات من البريد مع تذكيرات بريد/منبثقة. الإضافة والحذف يمرّان
            بموافقة HITL في الوضع التلقائي/الصارم.
          </p>
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {!status?.connected ? (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Link2 className="h-3.5 w-3.5" />
            ربط تقويم Google
          </button>
        ) : (
          <>
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
              مربوط{status.email ? ` · ${status.email}` : ''}
            </span>
            <button
              type="button"
              onClick={() => void scanMail()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <Mail className="h-3.5 w-3.5" />
              مسح البريد للدعوات
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              className="rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs disabled:opacity-40"
            >
              تحديث المواعيد
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-ab-border px-3 py-1.5 text-xs text-ab-warn disabled:opacity-40"
            >
              <Unlink className="h-3.5 w-3.5" />
              فصل
            </button>
          </>
        )}
      </div>

      {note && (
        <p className="mb-3 text-[11px] leading-snug text-stone-600">{note}</p>
      )}

      {events.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {events.map((e) => (
            <li
              key={e.id}
              className="rounded-md border border-ab-border bg-stone-50 px-2.5 py-2 text-[12px]"
            >
              <p className="font-medium text-ab-ink">{e.summary}</p>
              <p className="text-[11px] text-stone-500" dir="ltr">
                {e.start || '—'}
                {e.location ? ` · ${e.location}` : ''}
              </p>
              {e.htmlLink && (
                <a
                  href={e.htmlLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-ab-accent underline"
                  dir="ltr"
                >
                  فتح في Google Calendar
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {meetings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-ab-ink">من البريد</p>
          {meetings.map((m) => (
            <div
              key={m.id}
              className="rounded-md border border-dashed border-ab-border px-2.5 py-2 text-[12px]"
            >
              <p className="font-medium">{m.subject || '(بدون عنوان)'}</p>
              <p className="text-[11px] text-stone-500">{m.from}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-stone-600">
                {m.snippet}
              </p>
              {m.zoomUrl && (
                <p className="mt-1 text-[11px] text-ab-accent" dir="ltr">
                  {m.zoomUrl}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
