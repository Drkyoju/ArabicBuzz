'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Plus, Sparkles, Trash2, AlertTriangle } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { cn } from '@/lib/utils'

type RoomEvent = {
  id: string
  titleAr: string
  descriptionAr: string | null
  startsAt: string
  endsAt: string
  attendees: string[]
  source: string
  createdByAr: string | null
  status: string
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString('ar-SA', {
      timeZone: 'Asia/Riyadh',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function toLocalInput(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Shared room calendar board — belongs to everyone in the room + AI.
 * Not tied to one person's Google account.
 */
export function RoomCalendarBoard({
  scopeId: scopeIdProp,
}: {
  scopeId?: string
}) {
  const storeScope = useWorkspaceStore((s) => s.activeScopeId)
  const scopeId = scopeIdProp || storeScope
  const [events, setEvents] = useState<RoomEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [titleAr, setTitleAr] = useState('')
  const [startsAt, setStartsAt] = useState(() => toLocalInput())
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1)
    return toLocalInput(d)
  })
  const [attendees, setAttendees] = useState('')
  const [bulk, setBulk] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await fetch(
        `/api/rooms/calendar?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        events?: RoomEvent[]
        error?: string
        code?: string
      }
      if (!res.ok) {
        if (res.status === 401 || data.code === 'AUTH_REQUIRED') {
          setEvents([])
          setErr('GUEST')
          return
        }
        throw new Error(data.error || 'تعذّر التحميل')
      }
      setEvents(data.events || [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطأ')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [scopeId])

  useEffect(() => {
    void load()
    try {
      localStorage.setItem('ab-room-collab-seen', '1')
      window.dispatchEvent(new Event('ab-room-collab-seen'))
    } catch {
      /* ignore */
    }
  }, [load])

  const upcoming = useMemo(
    () =>
      events
        .filter((e) => e.status !== 'cancelled')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [events]
  )

  async function addManual() {
    if (!titleAr.trim() || busy) return
    setBusy(true)
    setMsg('')
    setErr('')
    try {
      const res = await fetch('/api/rooms/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'create',
          scopeId,
          titleAr: titleAr.trim(),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          attendees: attendees
            .split(/[,;\s]+/)
            .map((e) => e.trim())
            .filter((e) => e.includes('@')),
          source: 'manual',
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        conflicts?: unknown[]
      }
      if (!res.ok) throw new Error(data.error || 'فشل الإضافة')
      setMsg(data.messageAr || 'تمت الإضافة')
      setTitleAr('')
      setAttendees('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function ingestBulk() {
    // Lines: title | ISO-or-local-start | ISO-or-local-end | optional@email
    const lines = bulk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (!lines.length || busy) return
    setBusy(true)
    setMsg('')
    setErr('')
    try {
      const proposals = lines.map((line) => {
        const parts = line.split('|').map((p) => p.trim())
        const title = parts[0] || 'موعد'
        const start = parts[1]
          ? new Date(parts[1]).toISOString()
          : new Date().toISOString()
        const end = parts[2]
          ? new Date(parts[2]).toISOString()
          : new Date(Date.now() + 3600_000).toISOString()
        return {
          titleAr: title,
          startsAt: start,
          endsAt: end,
          fromEmail: parts[3]?.includes('@') ? parts[3] : undefined,
        }
      })
      const res = await fetch('/api/rooms/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'ingest',
          scopeId,
          proposals,
        }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل الدمج')
      setMsg(data.messageAr || 'تم الدمج')
      setBulk('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id: string) {
    setBusy(true)
    try {
      await fetch('/api/rooms/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'cancel', scopeId, eventId: id }),
      })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const sourceLabel = (s: string) =>
    s === 'ai'
      ? 'وكيل'
      : s === 'email'
        ? 'بريد'
        : s === 'import'
          ? 'استيراد'
          : 'يدوي'

  return (
    <section className="space-y-4" dir="rtl">
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-bold text-ab-ink">
          <CalendarDays className="h-5 w-5 text-ab-accent" aria-hidden />
          تقويم الغرفة المشترك
        </h2>
        <p className="text-sm text-stone-500">
          لوحة مواعيد للفريق كله — ليست تقويم شخص واحد. أي عضو يضيف يدوياً،
          والوكيل يدمج تواريخ من عدة بريدات ويعدّل التعارضات.
        </p>
      </div>

      <div className="rounded-xl border border-ab-border bg-ab-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ab-ink">إضافة يدوية</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-stone-500 sm:col-span-2">
            العنوان
            <input
              className="mt-1 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              placeholder="اجتماع تشغيل · تسليم تقرير…"
            />
          </label>
          <label className="block text-xs text-stone-500">
            البداية
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              dir="ltr"
            />
          </label>
          <label className="block text-xs text-stone-500">
            النهاية
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              dir="ltr"
            />
          </label>
          <label className="block text-xs text-stone-500 sm:col-span-2">
            مشاركون (بريد، اختياري)
            <input
              className="mt-1 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="email@example.com"
              dir="ltr"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy || !titleAr.trim()}
          title={!titleAr.trim() ? 'اكتب عنوان الموعد أولاً' : undefined}
          aria-disabled={busy || !titleAr.trim()}
          onClick={() => void addManual()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          أضف للوحة المشتركة
        </button>
      </div>

      <div className="rounded-xl border border-dashed border-ab-accent/30 bg-ab-accent/5 p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ab-ink">
          <Sparkles className="h-4 w-4 text-ab-accent" />
          دمج تواريخ من عدة أشخاص
        </h3>
        <p className="mb-2 text-[11px] text-stone-500">
          سطر لكل موعد:{' '}
          <code dir="ltr" className="text-[10px]">
            العنوان | 2026-08-05T10:00 | 2026-08-05T11:00 | email@…
          </code>
          — الوكيل أيضاً يستطيع فعل ذلك من المحادثة.
        </p>
        <textarea
          className="mb-2 min-h-[5rem] w-full rounded-md border border-ab-border bg-white p-2 font-mono text-[11px]"
          dir="ltr"
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={'العنوان | 2026-08-05T10:00 | 2026-08-05T11:00 | email@example.com'}
        />
        <button
          type="button"
          disabled={busy || !bulk.trim()}
          title={!bulk.trim() ? 'الصق سطراً واحداً على الأقل للدمج' : undefined}
          aria-disabled={busy || !bulk.trim()}
          onClick={() => void ingestBulk()}
          className="rounded-md bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          دمج وتعديل التعارضات تلقائياً
        </button>
      </div>

      {msg && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {msg}
        </p>
      )}
      {err && err !== 'GUEST' && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </p>
      )}

      <div className="rounded-xl border border-ab-border bg-white">
        <div className="flex items-center justify-between border-b border-ab-border px-4 py-2">
          <h3 className="text-sm font-semibold">اللوحة · {upcoming.length}</h3>
          <button
            type="button"
            onClick={() => void load()}
            className="text-[11px] text-ab-accent"
          >
            تحديث
          </button>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-stone-500">جاري تحميل المواعيد…</p>
        ) : err === 'GUEST' ? (
          <p className="p-6 text-center text-sm text-stone-500">
            مواعيد الغرفة المحفوظة تحتاج حساباً.{' '}
            <Link href="/auth/login" className="font-semibold text-ab-accent underline">
              سجّل الدخول
            </Link>{' '}
            لرؤيتها ولإضافة مواعيد للفريق.
          </p>
        ) : upcoming.length === 0 ? (
          <p className="p-6 text-center text-sm text-stone-400">
            لا مواعيد بعد — أضف يدوياً أو اطلب من الوكيل: «أضف اجتماع غداً
            ١٠ ص إلى تقويم الغرفة».
          </p>
        ) : (
          <ul className="divide-y divide-ab-border">
            {upcoming.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ab-ink">{e.titleAr}</p>
                  <p className="text-[11px] text-stone-500" dir="ltr">
                    {fmt(e.startsAt)} → {fmt(e.endsAt)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5',
                        e.source === 'ai'
                          ? 'bg-violet-50 text-violet-800'
                          : e.source === 'email'
                            ? 'bg-amber-50 text-amber-900'
                            : 'bg-stone-100 text-stone-600'
                      )}
                    >
                      {sourceLabel(e.source)}
                    </span>
                    {e.createdByAr && (
                      <span className="text-stone-400">
                        بواسطة {e.createdByAr}
                      </span>
                    )}
                    {e.attendees?.length > 0 && (
                      <span className="text-stone-400" dir="ltr">
                        {e.attendees.join(', ')}
                      </span>
                    )}
                  </div>
                  {e.descriptionAr && (
                    <p className="mt-1 text-xs text-stone-600">
                      {e.descriptionAr}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cancel(e.id)}
                  className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-700"
                  aria-label="إلغاء"
                  title="إلغاء من اللوحة"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-stone-400">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Google Calendar أسفل الصفحة اختياري فقط — لإرسال دعوات خارجية. المصدر
        الرسمي للعمل الجماعي هو هذه اللوحة.
      </p>
    </section>
  )
}
