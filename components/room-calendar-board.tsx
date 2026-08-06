'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  Plus,
  Sparkles,
  Trash2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
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

type ConflictInfo = {
  eventId: string
  titleAr: string
  startsAt: string
  endsAt: string
  overlapMinutes: number
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

function overlapMins(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const start = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime())
  const end = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime())
  return Math.max(0, Math.round((end - start) / 60_000))
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
  const signedIn = useSignedIn()
  const [events, setEvents] = useState<RoomEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])
  const [suggestionAr, setSuggestionAr] = useState('')
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
  const [formOpen, setFormOpen] = useState(true)

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
        .sort((a, b) => {
          const t = a.startsAt.localeCompare(b.startsAt)
          if (t) return t
          return (a.createdByAr || '').localeCompare(b.createdByAr || '', 'ar')
        }),
    [events]
  )

  const conflictIds = useMemo(() => {
    const ids = new Set<string>()
    for (let i = 0; i < upcoming.length; i++) {
      for (let j = i + 1; j < upcoming.length; j++) {
        const a = upcoming[i]
        const b = upcoming[j]
        if (new Date(b.startsAt).getTime() >= new Date(a.endsAt).getTime()) break
        if (overlapMins(a.startsAt, a.endsAt, b.startsAt, b.endsAt) > 0) {
          ids.add(a.id)
          ids.add(b.id)
        }
      }
    }
    return ids
  }, [upcoming])

  async function addManual() {
    if (!titleAr.trim() || busy || signedIn !== true) return
    setBusy(true)
    setMsg('')
    setErr('')
    setConflicts([])
    setSuggestionAr('')
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
            .split(/[,;\\s]+/)
            .map((e) => e.trim())
            .filter((e) => e.includes('@')),
          source: 'manual',
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        conflicts?: ConflictInfo[]
        suggestion?: { messageAr?: string } | null
      }
      if (!res.ok) throw new Error(data.error || 'فشل الإضافة')
      setMsg(data.messageAr || 'تمت الإضافة')
      setConflicts(Array.isArray(data.conflicts) ? data.conflicts : [])
      setSuggestionAr(data.suggestion?.messageAr || '')
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
    const lines = bulk
      .split('\\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (!lines.length || busy || signedIn !== true) return
    setBusy(true)
    setMsg('')
    setErr('')
    setConflicts([])
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

  async function reconcile(autoAdjust: boolean) {
    if (busy || signedIn !== true) return
    setBusy(true)
    setMsg('')
    setErr('')
    setConflicts([])
    try {
      const res = await fetch('/api/rooms/calendar', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'reconcile',
          scopeId,
          autoAdjust,
          notify: true,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        conflicts?: Array<{ a: ConflictInfo; b: ConflictInfo }>
      }
      if (!res.ok) throw new Error(data.error || 'فشل الترتيب')
      setMsg(data.messageAr || 'تم الترتيب')
      const flat: ConflictInfo[] = []
      for (const p of data.conflicts || []) {
        if (p?.b) flat.push(p.b)
      }
      setConflicts(flat)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id: string) {
    if (signedIn !== true) return
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

  /** Only treat as signed-in when session is confirmed — never show add form while null. */
  const isGuest = signedIn !== true || err === 'GUEST'
  const sessionPending = signedIn === null && err !== 'GUEST'

  return (
    <section className="space-y-4" dir="rtl">
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-bold text-ab-ink">
          <CalendarDays className="h-5 w-5 text-ab-accent" aria-hidden />
          تقويم الغرفة المشترك
        </h2>
        <p className="text-sm text-stone-500">
          لوحة بيضاء للفريق — أي عضو مسجّل يضيف موعداً، والكل يرى من أضاف ومتى.
          عند تداخل نفس الوقت يظهر تنبيه ويُبلَّغ تيليجرام إن رُبط.
        </p>
      </div>

      {sessionPending ? (
        <p className="rounded-xl border border-ab-border bg-white px-4 py-3 text-sm text-stone-500">
          جاري التحقق من الحساب…
        </p>
      ) : isGuest ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-5 text-center">
          <p className="text-sm font-semibold text-ab-ink">
            سجّل الدخول لإضافة مواعيد للفريق
          </p>
          <p className="mt-1 text-xs text-stone-600">
            الزائر يرى الواجهة فقط — لا مواعيد وهمية. بعد الدخول يظهر التقويم
            الحقيقي ويمكنك الضغط «أضف موعد».
          </p>
          <Link
            href="/auth/login"
            className="mt-3 inline-flex rounded-md bg-ab-accent px-4 py-2 text-xs font-semibold text-white"
          >
            سجّل الدخول
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-ab-accent/25 bg-ab-accent/5 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ab-ink">أضف موعد</h3>
            <button
              type="button"
              onClick={() => setFormOpen((v) => !v)}
              className="text-[11px] text-ab-accent"
            >
              {formOpen ? 'إخفاء النموذج' : 'إظهار النموذج'}
            </button>
          </div>
          {formOpen && (
            <>
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
                    placeholder="sara@company.sa, ahmed@…"
                    dir="ltr"
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={busy || !titleAr.trim() || signedIn !== true}
                title={
                  !titleAr.trim() ? 'اكتب عنوان الموعد أولاً' : undefined
                }
                onClick={() => void addManual()}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-ab-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                أضف موعد
              </button>
            </>
          )}
        </div>
      )}

      {conflicts.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950"
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            تعارض وقت — {conflicts.length} موعد متداخل
          </p>
          <ul className="mt-2 space-y-1">
            {conflicts.slice(0, 5).map((c) => (
              <li key={c.eventId}>
                «{c.titleAr}» · تداخل {c.overlapMinutes} د · {fmt(c.startsAt)}
              </li>
            ))}
          </ul>
          {suggestionAr && (
            <p className="mt-2 text-amber-900">{suggestionAr}</p>
          )}
          {signedIn === true && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void reconcile(true)}
              className="mt-2 rounded-md bg-amber-800 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              سوِّ التعارضات تلقائياً ونبّه الغرفة
            </button>
          )}
        </div>
      )}

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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ab-border px-4 py-2">
          <h3 className="text-sm font-semibold">
            اللوحة المشتركة · {upcoming.length}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {signedIn === true && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void reconcile(false)}
                className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-ab-ink disabled:opacity-40"
                title="ترتيب حسب التاريخ ومن أضاف + كشف التعارض"
              >
                <RefreshCw className="h-3 w-3" />
                رتّب وكشّف التعارض
              </button>
            )}
            <button
              type="button"
              onClick={() => void load()}
              className="text-[11px] text-ab-accent"
            >
              تحديث
            </button>
          </div>
        </div>
        {loading && signedIn === true ? (
          <p className="p-4 text-sm text-stone-500">جاري تحميل المواعيد…</p>
        ) : isGuest || sessionPending ? (
          <p className="p-6 text-center text-sm text-stone-500">
            مواعيد الغرفة المحفوظة تحتاج حساباً.{' '}
            <Link
              href="/auth/login"
              className="font-semibold text-ab-accent underline"
            >
              سجّل الدخول
            </Link>{' '}
            لرؤيتها.
          </p>
        ) : upcoming.length === 0 ? (
          <p className="p-6 text-center text-sm text-stone-400">
            لا مواعيد بعد — اضغط «أضف موعد» أعلاه، أو اطلب من الوكيل: «أضف
            اجتماع غداً ١٠ ص إلى تقويم الغرفة».
          </p>
        ) : (
          <ul className="divide-y divide-ab-border">
            {upcoming.map((e) => (
              <li
                key={e.id}
                className={cn(
                  'flex flex-wrap items-start justify-between gap-2 px-4 py-3',
                  conflictIds.has(e.id) && 'bg-amber-50/60'
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ab-ink">
                    {e.titleAr}
                    {conflictIds.has(e.id) && (
                      <span className="ms-2 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                        <AlertTriangle className="h-3 w-3" />
                        تعارض
                      </span>
                    )}
                  </p>
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
                {signedIn === true && (
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
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {signedIn === true && (
        <details className="rounded-xl border border-dashed border-ab-border bg-stone-50/80 p-4">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-stone-700">
            <Sparkles className="h-4 w-4 text-ab-accent" />
            دمج تواريخ من عدة أشخاص (متقدم)
          </summary>
          <p className="mb-2 mt-2 text-[11px] text-stone-500">
            سطر لكل موعد:{' '}
            <code dir="ltr" className="text-[10px]">
              العنوان | 2026-08-05T10:00 | 2026-08-05T11:00 | email@…
            </code>
            — أو اطلب من الوكيل في المحادثة.
          </p>
          <textarea
            className="mb-2 min-h-[5rem] w-full rounded-md border border-ab-border bg-white p-2 font-mono text-[11px]"
            dir="ltr"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={
              'اجتماع مبيعات | 2026-08-06T09:00 | 2026-08-06T10:00 | a@co.sa\\nمراجعة عقد | 2026-08-06T09:30 | 2026-08-06T10:30 | b@co.sa'
            }
          />
          <button
            type="button"
            disabled={busy || !bulk.trim()}
            onClick={() => void ingestBulk()}
            className="rounded-md bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            دمج وتعديل التعارضات تلقائياً
          </button>
        </details>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-stone-400">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        تقويم Google (إن ظهر في تبويب آخر) اختياري لدعوات خارجية فقط — مصدر
        الفريق هو هذه اللوحة.
      </p>
    </section>
  )
}
