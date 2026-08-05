'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock,
  History,
  Pencil,
  Radio,
  RefreshCw,
  ShieldCheck,
  Users,
  Video,
  ListTodo,
  Rocket,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { buildGuestDemoDigest, type DemoDigest } from '@/lib/demo/guest-digest'
import { AssociationRecipes } from '@/components/association-recipes'
import { FirstRunChecklist } from '@/components/first-run-checklist'
import { DateDual } from '@/components/date-dual'
import { cn } from '@/lib/utils'

type CalEvent = {
  id: string
  titleAr: string
  startsAtAr: string
  endsAtAr: string
  hasZoom?: boolean
  locationAr?: string | null
}

type Activity = {
  id: string
  actorAr: string
  actionAr: string
  detailAr?: string | null
  atAr: string
  kind: string
}

type Person = {
  nameAr: string
  email?: string | null
  actions: number
  lastAction: string
  lastAtAr: string
}

type Digest = {
  days?: { yesterday: string; today: string; tomorrow: string; dayAfter: string }
  calendar?: {
    yesterday: CalEvent[]
    today: CalEvent[]
    tomorrow: CalEvent[]
    dayAfter: CalEvent[]
    week: CalEvent[]
  }
  commitments?: {
    count: number
    items: Array<{
      id: string
      kind: 'event' | 'task' | 'deadline'
      titleAr: string
      whenAtAr: string
      detailAr?: string | null
    }>
  }
  systemDeadlines?: Array<{
    id: string
    labelAr: string
    daysLeft: number
    startsAtAr: string
  }>
  zoom?: {
    liveNow: boolean
    liveCount: number
    scheduledNowCount?: number
    configured?: boolean
    lastLiveAtAr?: string | null
    messageAr?: string
    recentSessions?: Array<{
      topic?: string | null
      live: boolean
      lastSeenAt: string
      endedAt?: string | null
    }>
    liveMeetings?: Array<{ topic: string; joinUrl?: string | null }>
  }
  activity?: Activity[]
  people?: Person[]
  tasks?: { openCount: number; items: Array<{ id: string; titleAr: string; status: string }> }
  recentPosts?: Array<{ authorAr: string; content: string; atAr: string; kind: string }>
  messageAr?: string
}

const TASK_STATUS_AR: Record<string, string> = {
  open: 'مفتوحة',
  in_progress: 'قيد التنفيذ',
  blocked: 'متعطّلة',
  done: 'منجزة',
  cancelled: 'ملغاة',
  deferred: 'مؤجّلة',
}

function taskStatusAr(status: string): string {
  return TASK_STATUS_AR[status] || 'مفتوحة'
}

function DayBlock({
  title,
  subtitle,
  events,
  accent,
}: {
  title: string
  subtitle?: string
  events: CalEvent[]
  accent?: string
}) {
  if (events.length === 0) return null
  return (
    <div
      className={cn(
        'rounded-xl border border-ab-border bg-white p-3',
        accent
      )}
    >
      <p className="text-sm font-bold text-ab-ink">{title}</p>
      {subtitle && (
        <p className="text-[10px] text-stone-400" dir="ltr">
          {subtitle}
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {events.map((e) => (
          <li
            key={e.id}
            className="rounded-lg border border-ab-border/70 bg-stone-50/80 px-2.5 py-2"
          >
            <p className="text-[13px] font-semibold text-ab-ink">{e.titleAr}</p>
            <p className="mt-0.5 text-[10px] text-stone-500">
              {e.startsAtAr}
              {e.hasZoom ? ' · Zoom' : ''}
              {e.locationAr ? ` · ${e.locationAr}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}


/**
 * لوحة اليوم — غرفة عمليات الجمعية: قرار معلّق، مواعيد نظام، وكلاء يعملون.
 * Empty sections are omitted entirely (no decorative «لا يوجد» cards).
 */
export function HomeDashboard({
  onNavigate,
  pendingApprovalsCount = 0,
}: {
  onNavigate?: (section: string) => void
  pendingApprovalsCount?: number
}) {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const signedIn = useSignedIn()
  const [liveData, setLiveData] = useState<Digest | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const demo = useMemo(() => buildGuestDemoDigest(), [])

  const load = useCallback(async () => {
    if (signedIn !== true) {
      setBusy(false)
      setLiveData(null)
      setErr('')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(
        `/api/rooms/home?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const json = (await res.json()) as Digest & {
        error?: string
        code?: string
      }
      if (!res.ok) {
        if (res.status === 401 || json.code === 'AUTH_REQUIRED') {
          setLiveData(null)
          setErr('')
          return
        }
        throw new Error(json.error || 'فشل التحميل')
      }
      setLiveData(json)

      try {
        const key = `ab-home-ping-${scopeId}`
        const last = Number(localStorage.getItem(key) || 0)
        if (Date.now() - last > 10 * 60_000) {
          localStorage.setItem(key, String(Date.now()))
          const { getBrowserSession } = await import('@/lib/supabase/browser')
          const session = await getBrowserSession()
          const name =
            localStorage.getItem('ab-display-name') ||
            session?.user?.user_metadata?.full_name ||
            session?.user?.email?.split('@')[0] ||
            'زائر'
          await fetch('/api/rooms/home', {
            method: 'POST',
            headers: await authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              scopeId,
              kind: 'presence',
              actorAr: String(name),
              actorEmail: session?.user?.email || null,
              actionAr: 'فتح لوحة اليوم',
              detailAr: 'يشاهد الصفحة الرئيسية',
            }),
          })
        }
      } catch {
        /* ignore */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطأ')
    } finally {
      setBusy(false)
    }
  }, [scopeId, signedIn])

  useEffect(() => {
    void load()
    if (signedIn !== true) return
    const t = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(t)
  }, [load, signedIn])

  const isGuest = signedIn === false
  const authPending = signedIn === null
  const viewData: Digest | DemoDigest = isGuest
    ? demo
    : liveData || {
        calendar: {
          yesterday: [],
          today: [],
          tomorrow: [],
          dayAfter: [],
          week: [],
        },
      }
  const cal = viewData.calendar
  const zoom = viewData.zoom

  const isEmptyWorkspace =
    isGuest ||
    (signedIn === true &&
      liveData !== null &&
      (liveData.commitments?.count || 0) === 0 &&
      (liveData.systemDeadlines || []).length === 0 &&
      (liveData.tasks?.openCount || 0) === 0 &&
      (liveData.calendar?.week || []).length === 0 &&
      (liveData.activity || []).length === 0 &&
      (liveData.recentPosts || []).length === 0 &&
      pendingApprovalsCount === 0)

  const livePending = isGuest || authPending ? 0 : pendingApprovalsCount
  const deadlines =
    isGuest || authPending ? [] : (viewData.systemDeadlines || []).slice(0, 4)
  const acts =
    isGuest || authPending
      ? []
      : [
          ...(liveData?.activity || [])
            .filter(
              (a) =>
                a.kind === 'agent' ||
                a.kind === 'hitl' ||
                a.kind === 'message' ||
                a.kind === 'system'
            )
            .slice(0, 3)
            .map((a) => ({
              agentAr: a.actorAr,
              statusAr: a.actionAr,
              detailAr: a.detailAr || a.atAr,
            })),
        ]

  const hasDayEvents =
    !authPending &&
    (cal?.yesterday || []).length +
      (cal?.today || []).length +
      (cal?.tomorrow || []).length +
      (cal?.dayAfter || []).length >
      0
  const hasCommitments =
    !authPending && (viewData.commitments?.items || []).length > 0
  const hasWeek = !authPending && (cal?.week || []).length > 0
  const hasPeople = !authPending && (viewData.people || []).length > 0
  const hasActivity = !authPending && (viewData.activity || []).length > 0
  const hasPosts = !authPending && (viewData.recentPosts || []).length > 0
  const hasTasks = !authPending && (viewData.tasks?.items || []).length > 0
  const showZoomStrip = !authPending && Boolean(zoom?.liveNow)
  const showCockpit =
    !isGuest &&
    !authPending &&
    (livePending > 0 || deadlines.length > 0 || acts.length > 0)

  // Auth still resolving — avoid flashing empty signed-in chrome / recipes.
  if (authPending) {
    return (
      <section className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:px-6" dir="rtl">
        <header>
          <h1 className="text-2xl font-bold text-ab-ink">لوحة اليوم</h1>
          <DateDual className="mt-2" />
        </header>
        <p className="text-sm text-stone-500">جاري التحميل…</p>
      </section>
    )
  }

  // ── Guest: one clear login path, no empty chrome ──
  if (isGuest) {
    return (
      <section className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:px-6" dir="rtl">
        <header>
          <h1 className="text-2xl font-bold text-ab-ink">لوحة اليوم</h1>
          <DateDual className="mt-2" />
        </header>
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-5">
          <p className="text-sm font-semibold text-ab-ink">
            سجّل الدخول للعمل
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-amber-950/80">
            الزائر يرى معاينة فقط. بعد الدخول تظهر المواعيد والمهام والموافقات
            الحقيقية — بلا بيانات وهمية.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('settings')}
              className="rounded-md bg-ab-accent px-3 py-2 text-xs font-semibold text-white"
            >
              سجّل الدخول
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('calendar')}
              className="rounded-md border border-ab-border bg-white px-3 py-2 text-xs font-medium text-ab-ink"
            >
              تصفّح التقويم
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 md:px-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ab-ink">لوحة اليوم</h1>
          <p className="mt-1 max-w-lg text-sm text-stone-500">
            ما الذي ينتظر قرارك، وما المواعيد النظامية، ومن يعمل الآن.
          </p>
          <DateDual className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-2">
          {!isEmptyWorkspace && (
            <button
              type="button"
              onClick={() =>
                document.getElementById('ab-recipes')?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                })
              }
              className="rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white"
            >
              تشغيل وصفة
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs text-stone-700 disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
            تحديث
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('calendar')}
            className="rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs"
          >
            التقويم
          </button>
        </div>
      </header>

      {showCockpit && (
        <div className="grid gap-3 lg:grid-cols-12">
          {livePending > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 lg:col-span-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-amber-950">
                  <ShieldCheck className="h-4 w-4" />
                  يحتاج قرارك
                  <span className="tabular-nums text-amber-800">
                    ({livePending})
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate?.('approvals')}
                  className="text-[11px] font-semibold text-amber-900 underline"
                >
                  صندوق الموافقات
                </button>
              </div>
              <button
                type="button"
                onClick={() => onNavigate?.('approvals')}
                className="mt-2.5 w-full rounded-lg border border-amber-200 bg-white/80 px-3 py-3 text-right text-[12px] font-semibold text-amber-950 hover:bg-white"
              >
                {livePending} موافقة معلّقة — افتح صندوق الموافقات للاعتماد أو
                الرفض
              </button>
            </div>
          )}

          {deadlines.length > 0 && (
            <div className="rounded-xl border border-ab-border bg-white p-3.5 lg:col-span-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                  <CalendarDays className="h-4 w-4 text-ab-accent" />
                  مواعيد نظامية
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate?.('calendar')}
                  className="text-[11px] text-ab-accent underline"
                >
                  التقويم
                </button>
              </div>
              <ul className="mt-2.5 space-y-2">
                {deadlines.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-baseline justify-between gap-2 text-[12px]"
                  >
                    <span className="font-medium text-ab-ink">{d.labelAr}</span>
                    <span
                      className={cn(
                        'shrink-0 tabular-nums text-[11px]',
                        d.daysLeft < 0
                          ? 'font-semibold text-ab-danger'
                          : d.daysLeft <= 14
                            ? 'font-semibold text-ab-warn'
                            : 'text-stone-500'
                      )}
                    >
                      {d.daysLeft < 0
                        ? `متأخر ${Math.abs(d.daysLeft)}ي`
                        : `متبقٍ ${d.daysLeft} يوم`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {acts.length > 0 && (
            <div className="rounded-xl border border-ab-border bg-white p-3.5 lg:col-span-3">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                <Radio className="h-4 w-4 text-ab-accent" />
                يعمل الآن
              </h2>
              <ul className="mt-2.5 space-y-2">
                {acts.slice(0, 3).map((a, i) => (
                  <li key={`${a.agentAr}-${i}`} className="text-[12px]">
                    <p className="font-semibold text-ab-ink">{a.agentAr}</p>
                    <p className="text-[11px] text-ab-accent">{a.statusAr}</p>
                    <p className="text-[10px] text-stone-500">{a.detailAr}</p>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onNavigate?.('chats')}
                className="mt-3 text-[11px] font-medium text-ab-accent underline"
              >
                الغرف
              </button>
            </div>
          )}
        </div>
      )}

      {signedIn === true && !isEmptyWorkspace && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-[12px] text-emerald-900">
          جلسة مسجّلة — الغرف والموافقات والربط بـ Drive/تيليجرام تُحفظ لحسابك.
        </div>
      )}

      {isEmptyWorkspace && signedIn === true && (
        <div className="space-y-3 rounded-xl border border-ab-accent/25 bg-ab-accent/5 p-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-base font-bold text-ab-ink">
              <Rocket className="h-4 w-4 text-ab-accent" aria-hidden />
              مساحتك جاهزة — ابدأ بثلاث خطوات
            </h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-stone-600">
              اللوحة فارغة لأن هذه الغرفة جديدة. أكمل الخطوات أدناه لتظهر
              المواعيد والمهام تلقائياً.
            </p>
          </div>
          <ol className="grid gap-2 sm:grid-cols-3">
            <li className="rounded-lg border border-ab-border bg-white p-3">
              <p className="text-[12px] font-semibold text-ab-ink">
                ١. اربط Google
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
                للدعوات الخارجية وملفات Drive — خطوة واحدة من الإعدادات.
              </p>
              <button
                type="button"
                onClick={() => onNavigate?.('settings')}
                className="mt-2 rounded-md bg-ab-ink px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                الإعدادات
              </button>
            </li>
            <li className="rounded-lg border border-ab-border bg-white p-3">
              <p className="text-[12px] font-semibold text-ab-ink">
                ٢. زامن ملفات الفريق
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
                فهرسة مجلد Drive حتى يجيب الوكيل من ملفاتكم لا من تخمينه.
              </p>
              <button
                type="button"
                onClick={() => onNavigate?.('settings')}
                className="mt-2 rounded-md border border-ab-border px-2.5 py-1 text-[11px] font-medium text-ab-ink"
              >
                الملفات والمعرفة
              </button>
            </li>
            <li className="rounded-lg border border-ab-border bg-white p-3">
              <p className="text-[12px] font-semibold text-ab-ink">
                ٣. أضف أول مهمة أو موعد
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
                من لوحة التقويم والمهام المشتركة — تظهر فوراً في لوحة اليوم.
              </p>
              <button
                type="button"
                onClick={() => onNavigate?.('calendar')}
                className="mt-2 rounded-md border border-ab-border px-2.5 py-1 text-[11px] font-medium text-ab-ink"
              >
                تقويم ومهام الفريق
              </button>
            </li>
          </ol>
          <FirstRunChecklist
            onNavigate={onNavigate}
            className="rounded-lg border border-ab-border bg-white p-3 text-sm"
          />
        </div>
      )}

      {!isEmptyWorkspace && <AssociationRecipes onNavigate={onNavigate} />}

      {err && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {err}
        </p>
      )}

      {busy && !liveData && (
        <p className="text-sm text-stone-500">جاري تحميل لوحة اليوم…</p>
      )}

      {!isEmptyWorkspace && (
        <>
          {showZoomStrip && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-sm font-bold text-ab-ink">
                    Zoom مباشر الآن ({zoom?.liveCount})
                  </p>
                  <p className="text-[11px] text-stone-500">
                    {(() => {
                      const live = zoom as
                        | { liveMeetings?: Array<{ topic: string }> }
                        | undefined
                      return (
                        live?.liveMeetings?.[0]?.topic ||
                        zoom?.messageAr ||
                        ''
                      )
                    })()}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-bold text-white">
                <Radio className="h-3 w-3 animate-pulse" />
                LIVE
              </span>
            </div>
          )}

          {hasDayEvents && (
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                <CalendarDays className="h-4 w-4 text-ab-accent" />
                المواعيد — أمس / اليوم / غداً / بعده
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DayBlock
                  title="أمس"
                  subtitle={viewData.days?.yesterday}
                  events={cal?.yesterday || []}
                />
                <DayBlock
                  title="اليوم"
                  subtitle={viewData.days?.today}
                  events={cal?.today || []}
                  accent="ring-1 ring-ab-accent/30"
                />
                <DayBlock
                  title="غداً"
                  subtitle={viewData.days?.tomorrow}
                  events={cal?.tomorrow || []}
                />
                <DayBlock
                  title="بعد غد"
                  subtitle={viewData.days?.dayAfter}
                  events={cal?.dayAfter || []}
                />
              </div>
            </div>
          )}

          {hasCommitments && (
            <div className="rounded-xl border border-ab-border bg-white p-4">
              <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                <ListTodo className="h-4 w-4 text-ab-accent" />
                التزامات هذا الأسبوع
              </h2>
              <p className="mb-3 text-[11px] text-stone-500">
                من المهام + المواعيد + مواعيد النظام (
                {viewData.commitments?.count || 0})
              </p>
              <ul className="divide-y divide-ab-border">
                {(viewData.commitments?.items || []).map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
                  >
                    <span>
                      <span className="ms-1 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">
                        {c.kind === 'task'
                          ? 'مهمة'
                          : c.kind === 'deadline'
                            ? 'نظام'
                            : 'موعد'}
                      </span>
                      <span className="font-medium text-ab-ink">{c.titleAr}</span>
                    </span>
                    <span className="text-[11px] text-stone-500">
                      {c.whenAtAr}
                      {c.detailAr ? ` · ${c.detailAr}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {(viewData.systemDeadlines || []).length > 0 && (
                <div className="mt-3 border-t border-ab-border pt-3">
                  <p className="mb-1 text-[11px] font-semibold text-stone-600">
                    مواعيد النظام القادمة
                  </p>
                  <ul className="space-y-1 text-xs">
                    {(viewData.systemDeadlines || []).map((d) => (
                      <li key={d.id} className="flex justify-between gap-2">
                        <span>{d.labelAr}</span>
                        <span className="tabular-nums text-stone-500">
                          {d.daysLeft < 0
                            ? `متأخر ${Math.abs(d.daysLeft)}ي`
                            : `${d.daysLeft} يوم`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {hasWeek && (
            <div className="rounded-xl border border-ab-border bg-ab-surface p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                <Clock className="h-4 w-4 text-ab-accent" />
                أحداث هذا الأسبوع
              </h2>
              <ul className="divide-y divide-ab-border">
                {(cal?.week || []).map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
                  >
                    <span className="font-medium text-ab-ink">{e.titleAr}</span>
                    <span className="text-[11px] text-stone-500">
                      {e.startsAtAr}
                      {e.hasZoom ? ' · Zoom' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(hasPeople || hasActivity) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {hasPeople && (
                <div className="rounded-xl border border-ab-border bg-white p-4">
                  <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                    <Users className="h-4 w-4 text-ab-accent" />
                    من كانوا هنا وماذا عملوا
                  </h2>
                  <ul className="space-y-2">
                    {(viewData.people || []).map((p) => (
                      <li
                        key={`${p.nameAr}-${p.email || ''}`}
                        className="rounded-lg border border-ab-border/70 px-2.5 py-2"
                      >
                        <p className="text-[13px] font-semibold text-ab-ink">
                          {p.nameAr}
                          {p.email ? (
                            <span
                              className="mr-1 text-[10px] font-normal text-stone-400"
                              dir="ltr"
                            >
                              {p.email}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-stone-500">
                          {[
                            p.lastAction,
                            `${p.actions} إجراء`,
                            p.lastAtAr,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {hasActivity && (
                <div className="rounded-xl border border-ab-border bg-white p-4">
                  <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                    <Pencil className="h-4 w-4 text-ab-accent" />
                    آخر التعديلات
                  </h2>
                  <ul className="max-h-72 space-y-2 overflow-auto">
                    {(viewData.activity || []).slice(0, 15).map((a) => (
                      <li
                        key={a.id}
                        className="text-[12px] leading-snug text-stone-600"
                      >
                        <span className="font-semibold text-ab-ink">
                          {a.actorAr}
                        </span>
                        {' · '}
                        {a.actionAr}
                        {a.detailAr ? ` — ${a.detailAr}` : ''}
                        <span className="text-stone-400"> · {a.atAr}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {(hasPosts || hasTasks) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {hasPosts && (
                <div className="rounded-xl border border-ab-border bg-white p-4">
                  <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                    <History className="h-4 w-4 text-ab-accent" />
                    آخر الرسائل
                  </h2>
                  <ul className="space-y-2">
                    {(viewData.recentPosts || []).map((p, i) => (
                      <li
                        key={`${p.atAr}-${i}`}
                        className="text-[12px] text-stone-600"
                      >
                        <span className="font-semibold text-ab-ink">
                          {p.authorAr}
                        </span>
                        {' · '}
                        {p.content}
                        <span className="text-stone-400"> · {p.atAr}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {hasTasks && (
                <div className="rounded-xl border border-ab-border bg-white p-4">
                  <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                    <ListTodo className="h-4 w-4 text-ab-accent" />
                    مهام مفتوحة ({viewData.tasks?.openCount || 0})
                  </h2>
                  <ul className="space-y-1.5">
                    {(viewData.tasks?.items || []).map((t) => (
                      <li key={t.id} className="text-[12px] text-ab-ink">
                        {t.titleAr}
                        <span className="mr-1 text-[10px] text-stone-400">
                          ({taskStatusAr(t.status)})
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('calendar')}
                    className="mt-3 text-[11px] text-ab-accent underline"
                  >
                    عرض لوحة المهام في التقويم
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
