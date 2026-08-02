'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays,
  Copy,
  Link2,
  Loader2,
  Mail,
  Unlink,
  Users,
} from 'lucide-react'
import {
  authHeaders,
  connectGoogleCalendar,
  getBrowserSession,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'

type CalStatus = {
  connected?: boolean
  email?: string | null
  emails?: string[]
  accountCount?: number
  error?: string
}

type EventRow = {
  id: string
  summary: string
  start?: string
  end?: string
  htmlLink?: string
  location?: string
  accountEmail?: string
}

type MeetingRow = {
  id: string
  subject: string
  from: string
  snippet: string
  zoomUrl?: string
  dateHint?: string
}

type DupeGroup = {
  kind: string
  labelAr: string
  events: EventRow[]
}

type FreeSlot = {
  startIso: string
  endIso: string
  durationMinutes: number
}

function formatSlot(iso: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: 'Asia/Riyadh',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function GoogleCalendarPanel() {
  const [status, setStatus] = useState<CalStatus | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  const [dupes, setDupes] = useState<DupeGroup[]>([])
  const [slots, setSlots] = useState<FreeSlot[]>([])
  const [alignAccounts, setAlignAccounts] = useState<string[]>([])
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
        const ev = await fetch('/api/google/calendar?action=events&max=12', {
          headers,
        })
        const payload = (await ev.json()) as {
          events?: EventRow[]
          error?: string
        }
        if (ev.ok) setEvents(payload.events || [])
        else setNote(payload.error || 'تعذّر جلب المواعيد')

        const du = await fetch('/api/google/calendar?action=duplicates&max=40', {
          headers,
        })
        const duPayload = (await du.json()) as {
          groups?: DupeGroup[]
          messageAr?: string
          error?: string
        }
        if (du.ok) {
          setDupes(duPayload.groups || [])
          if (duPayload.groups && duPayload.groups.length > 0) {
            setNote(duPayload.messageAr || 'وُجدت مواعيد مكررة أو متعارضة.')
          }
        }
      } else {
        setEvents([])
        setDupes([])
        setSlots([])
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
      const msg = e instanceof Error ? e.message : 'فشل بدء الربط'
      setNote(
        /provider is not enabled|Unsupported provider/i.test(msg)
          ? 'مزوّد Google غير مفعّل في Supabase — فعّل Google وأضف Client ID/Secret ثم أعد المحاولة.'
          : msg
      )
      setBusy(false)
    }
  }

  async function disconnect(email?: string) {
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/google/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'disconnect',
          email: email || undefined,
        }),
      })
      const data = (await res.json()) as CalStatus & { error?: string }
      if (!res.ok) throw new Error(data.error || 'فشل الفصل')
      setStatus(data)
      if (!data.connected) {
        setEvents([])
        setMeetings([])
        setDupes([])
        setSlots([])
      }
      setNote(
        email
          ? `تم فصل ${email}.`
          : 'تم فصل كل حسابات تقويم Google.'
      )
      await refresh()
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

  async function findAlignment() {
    setBusy(true)
    setNote('')
    setSlots([])
    try {
      const res = await fetch(
        '/api/google/calendar?action=align&duration=60&max=10',
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        slots?: FreeSlot[]
        accounts?: string[]
        messageAr?: string
        error?: string
      }
      if (!res.ok) throw new Error(data.error || 'فشل المقارنة')
      setSlots(data.slots || [])
      setAlignAccounts(data.accounts || [])
      setNote(data.messageAr || 'تمت المقارنة.')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل إيجاد الأوقات المشتركة')
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
            scopes: 'calendar,gmail.readonly,drive.readonly',
          }),
        })
        await refresh()
      } catch {
        /* ignore */
      }
    })()
  }, [refresh])

  const emails = status?.emails || (status?.email ? [status.email] : [])

  return (
    <div dir="rtl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <CalendarDays className="h-4 w-4 text-ab-accent" aria-hidden />
            تقويم Google · عدة بريدات
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            اربط بريداً أو أكثر («ربط بريد إضافي» → اختر حساب Google الآخر)، ثم
            اضغط «أوقات مشتركة للجميع» أو اسأل في الدردشة: «متى نتفرغ كلنا؟».
          </p>
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void connect()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Link2 className="h-3.5 w-3.5" />
          {status?.connected ? 'ربط بريد إضافي' : 'ربط تقويم Google'}
        </button>
        {status?.connected && (
          <>
            <button
              type="button"
              onClick={() => void findAlignment()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-ab-accent/40 bg-ab-accent/5 px-3 py-1.5 text-xs text-ab-accent disabled:opacity-40"
            >
              <Users className="h-3.5 w-3.5" />
              أوقات مشتركة للجميع
            </button>
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
              className="inline-flex items-center gap-1.5 rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" />
              تحديث
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-ab-border px-3 py-1.5 text-xs text-ab-warn disabled:opacity-40"
            >
              <Unlink className="h-3.5 w-3.5" />
              فصل الكل
            </button>
          </>
        )}
      </div>

      {emails.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {emails.map((email) => (
            <li
              key={email}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900"
            >
              <span dir="ltr">{email}</span>
              <button
                type="button"
                onClick={() => void disconnect(email)}
                className="text-emerald-700/70 hover:text-red-600"
                aria-label={`فصل ${email}`}
                title="فصل هذا البريد"
              >
                <Unlink className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {note && (
        <p className="mb-3 text-[11px] leading-snug text-stone-600">{note}</p>
      )}

      {slots.length > 0 && (
        <div className="mb-3 rounded-md border border-ab-accent/30 bg-ab-accent/5 px-2.5 py-2">
          <p className="mb-1.5 text-[11px] font-semibold text-ab-accent">
            فترات مشتركة متاحة
            {alignAccounts.length > 0
              ? ` · ${alignAccounts.length} حساب`
              : ''}
          </p>
          <ul className="space-y-1">
            {slots.map((s) => (
              <li
                key={`${s.startIso}-${s.endIso}`}
                className="text-[11px] text-stone-700"
              >
                {formatSlot(s.startIso)}
                <span className="text-stone-400"> — </span>
                {formatSlot(s.endIso)}
                <span className="ms-1 text-stone-400">
                  ({s.durationMinutes} د)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dupes.length > 0 && (
        <div className="mb-3 rounded-md border border-ab-warn/40 bg-ab-warn/10 px-2.5 py-2">
          <p className="mb-1.5 text-[11px] font-semibold text-ab-warn">
            تكرار / تعارض ({dupes.length})
          </p>
          <ul className="space-y-2">
            {dupes.map((g, i) => (
              <li key={`${g.kind}-${i}`} className="text-[11px] text-stone-700">
                <p className="font-medium">{g.labelAr}</p>
                <ul className="mt-0.5 list-disc pr-4 text-stone-600">
                  {g.events.map((e) => (
                    <li key={e.id}>
                      {e.summary}
                      {e.accountEmail ? (
                        <span className="text-stone-400" dir="ltr">
                          {' '}
                          · {e.accountEmail}
                        </span>
                      ) : null}
                      {e.start ? (
                        <span className="text-stone-400" dir="ltr">
                          {' '}
                          · {e.start}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
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
                {e.accountEmail ? `${e.accountEmail} · ` : ''}
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
