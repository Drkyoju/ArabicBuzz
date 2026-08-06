'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, List } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { cn } from '@/lib/utils'

type RoomEvent = {
  id: string
  titleAr: string
  startsAt: string
  endsAt: string
  source: string
  createdByAr: string | null
  status: string
  locationAr?: string | null
}

const TZ = 'Asia/Riyadh'

/** أيام الأسبوع — التقويم العربي يبدأ السبت */
const WEEKDAYS_AR = [
  'سبت',
  'أحد',
  'إثنين',
  'ثلاثاء',
  'أربعاء',
  'خميس',
  'جمعة',
]

function riyadhYmd(iso: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function riyadhYm(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  })
    .format(d)
    .slice(0, 7)
}

function shiftYm(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabelAr(ym: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: TZ,
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${ym}-15T12:00:00+03:00`))
  } catch {
    return ym
  }
}

function weekdayAr(ymd: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: TZ,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${ymd}T12:00:00+03:00`))
  } catch {
    return ymd
  }
}

function fmtTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function daysInMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 0=سبت … 6=جمعة */
function saturdayBasedWeekday(ymd: string) {
  const js = new Date(`${ymd}T12:00:00+03:00`).getDay() // 0=Sun
  return (js + 1) % 7
}

function monthCells(ym: string) {
  const n = daysInMonth(ym)
  const firstYmd = `${ym}-01`
  const pad = saturdayBasedWeekday(firstYmd)
  const cells: Array<{ ymd: string | null; day: number | null }> = []
  for (let i = 0; i < pad; i++) cells.push({ ymd: null, day: null })
  for (let d = 1; d <= n; d++) {
    const ymd = `${ym}-${String(d).padStart(2, '0')}`
    cells.push({ ymd, day: d })
  }
  while (cells.length % 7 !== 0) cells.push({ ymd: null, day: null })
  return cells
}

/**
 * التقويم الكامل — كل مواعيد الغرفة المشتركة، بعرض شهر قابل للتنقّل أو قائمة شاملة.
 */
export function RoomFullCalendar({
  scopeId: scopeIdProp,
}: {
  scopeId?: string
}) {
  const storeScope = useWorkspaceStore((s) => s.activeScopeId)
  const scopeId = scopeIdProp || storeScope
  const signedIn = useSignedIn()
  const [events, setEvents] = useState<RoomEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [viewYm, setViewYm] = useState(() => riyadhYm())
  const [mode, setMode] = useState<'month' | 'all'>('month')
  const todayYmd = riyadhYmd(new Date().toISOString())

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
      setEvents(
        (data.events || [])
          .filter((e) => e.status !== 'cancelled')
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطأ')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [scopeId])

  useEffect(() => {
    if (signedIn === true) void load()
    else if (signedIn === false) {
      setLoading(false)
      setEvents([])
      setErr('GUEST')
    }
  }, [signedIn, load])

  const byYmd = useMemo(() => {
    const m = new Map<string, RoomEvent[]>()
    for (const e of events) {
      const ymd = riyadhYmd(e.startsAt)
      const list = m.get(ymd) || []
      list.push(e)
      m.set(ymd, list)
    }
    return m
  }, [events])

  const monthEvents = useMemo(
    () => events.filter((e) => riyadhYmd(e.startsAt).startsWith(viewYm)),
    [events, viewYm]
  )

  const monthGroups = useMemo(() => {
    const m = new Map<string, RoomEvent[]>()
    for (const e of monthEvents) {
      const ymd = riyadhYmd(e.startsAt)
      const list = m.get(ymd) || []
      list.push(e)
      m.set(ymd, list)
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [monthEvents])

  const allMonthGroups = useMemo(() => {
    const byMonth = new Map<string, Map<string, RoomEvent[]>>()
    for (const e of events) {
      const ymd = riyadhYmd(e.startsAt)
      const ym = ymd.slice(0, 7)
      if (!byMonth.has(ym)) byMonth.set(ym, new Map())
      const days = byMonth.get(ym)!
      const list = days.get(ymd) || []
      list.push(e)
      days.set(ymd, list)
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, days]) => ({
        ym,
        labelAr: monthLabelAr(ym),
        days: Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b)),
      }))
  }, [events])

  const cells = useMemo(() => monthCells(viewYm), [viewYm])

  if (signedIn === null || (loading && signedIn === true)) {
    return (
      <p className="rounded-xl border border-ab-border bg-white p-4 text-sm text-stone-500">
        جاري تحميل التقويم الكامل…
      </p>
    )
  }

  if (err === 'GUEST' || signedIn === false) {
    return (
      <p className="rounded-xl border border-ab-border bg-white p-6 text-center text-sm text-stone-500">
        التقويم الكامل يحتاج حساباً لعرض كل مواعيد الغرفة المشتركة.
      </p>
    )
  }

  return (
    <section className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-lg font-bold text-ab-ink">
            <CalendarDays className="h-5 w-5 text-ab-accent" aria-hidden />
            التقويم الكامل
          </h3>
          <p className="mt-0.5 text-[12px] text-stone-500">
            كل مواعيد الغرفة المشتركة — تنقّل بين الأشهر أو اعرض القائمة كاملة.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode('month')}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold',
              mode === 'month'
                ? 'bg-ab-ink text-white'
                : 'border border-ab-border bg-white text-stone-600'
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            شهر
          </button>
          <button
            type="button"
            onClick={() => setMode('all')}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold',
              mode === 'all'
                ? 'bg-ab-ink text-white'
                : 'border border-ab-border bg-white text-stone-600'
            )}
          >
            <List className="h-3.5 w-3.5" />
            كل المواعيد
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="text-[11px] font-semibold text-ab-accent underline"
          >
            تحديث
          </button>
        </div>
      </div>

      {err && err !== 'GUEST' && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </p>
      )}

      {mode === 'month' && (
        <>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-ab-border bg-white px-3 py-2">
            <button
              type="button"
              onClick={() => setViewYm((ym) => shiftYm(ym, 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ab-border text-stone-600 hover:bg-stone-50"
              aria-label="الشهر التالي"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-sm font-bold text-ab-ink">
                {monthLabelAr(viewYm)}
              </p>
              <p className="text-[10px] text-stone-400">
                {monthEvents.length} موعد
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewYm((ym) => shiftYm(ym, -1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ab-border text-stone-600 hover:bg-stone-50"
              aria-label="الشهر السابق"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-ab-border bg-white">
            <div className="grid grid-cols-7 border-b border-ab-border bg-stone-50/80">
              {WEEKDAYS_AR.map((d) => (
                <div
                  key={d}
                  className="px-1 py-2 text-center text-[10px] font-semibold text-stone-500"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((c, i) => {
                if (!c.ymd) {
                  return (
                    <div
                      key={`empty-${i}`}
                      className="min-h-[3.25rem] border-b border-e border-ab-border/60 bg-stone-50/40"
                    />
                  )
                }
                const dayEvents = byYmd.get(c.ymd) || []
                const isToday = c.ymd === todayYmd
                return (
                  <button
                    key={c.ymd}
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(`full-cal-${c.ymd}`)
                      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                    }}
                    className={cn(
                      'min-h-[3.25rem] border-b border-e border-ab-border/60 px-1 py-1.5 text-right hover:bg-stone-50',
                      isToday && 'bg-ab-accent/5 ring-1 ring-inset ring-ab-accent/25'
                    )}
                  >
                    <span
                      className={cn(
                        'text-[11px] tabular-nums',
                        isToday
                          ? 'font-bold text-ab-accent'
                          : 'font-medium text-ab-ink'
                      )}
                    >
                      {c.day}
                    </span>
                    {dayEvents.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {dayEvents.slice(0, 2).map((e) => (
                          <p
                            key={e.id}
                            className="truncate text-[9px] leading-tight text-stone-600"
                          >
                            {e.titleAr}
                          </p>
                        ))}
                        {dayEvents.length > 2 && (
                          <p className="text-[9px] text-stone-400">
                            +{dayEvents.length - 2}
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-[11px] font-semibold text-stone-500">
              مواعيد {monthLabelAr(viewYm)}
            </h4>
            {monthGroups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ab-border bg-stone-50/60 px-3 py-3 text-[12px] text-stone-400">
                لا مواعيد في هذا الشهر.
              </p>
            ) : (
              <ul className="divide-y divide-ab-border overflow-hidden rounded-xl border border-ab-border bg-white">
                {monthGroups.map(([ymd, list]) => (
                  <li key={ymd} id={`full-cal-${ymd}`} className="px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-stone-500">
                      {weekdayAr(ymd)}
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {list.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[12px] font-semibold text-ab-ink">
                            {e.titleAr}
                          </span>
                          <span className="text-[10px] text-stone-400">
                            {fmtTime(e.startsAt)}
                            {e.createdByAr ? ` · ${e.createdByAr}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {mode === 'all' && (
        <div className="space-y-4">
          <p className="text-[11px] text-stone-500">
            {events.length} موعد في تقويم الغرفة المشترك
          </p>
          {allMonthGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ab-border bg-stone-50/60 px-3 py-3 text-[12px] text-stone-400">
              لا مواعيد بعد في هذه الغرفة.
            </p>
          ) : (
            allMonthGroups.map((g) => (
              <div key={g.ym} className="space-y-2">
                <h4 className="text-sm font-bold text-ab-ink">{g.labelAr}</h4>
                <ul className="divide-y divide-ab-border overflow-hidden rounded-xl border border-ab-border bg-white">
                  {g.days.map(([ymd, list]) => (
                    <li key={ymd} className="px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-stone-500">
                        {weekdayAr(ymd)}
                      </p>
                      <ul className="mt-1.5 space-y-1.5">
                        {list.map((e) => (
                          <li
                            key={e.id}
                            className="flex flex-wrap items-baseline gap-x-2"
                          >
                            <span className="text-[12px] font-semibold text-ab-ink">
                              {e.titleAr}
                            </span>
                            <span className="text-[10px] text-stone-400">
                              {fmtTime(e.startsAt)}
                              {e.createdByAr ? ` · ${e.createdByAr}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}
