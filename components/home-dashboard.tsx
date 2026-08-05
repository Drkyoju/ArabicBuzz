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
  Fingerprint,
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
      {events.length === 0 ? (
        <p className="mt-3 text-xs text-stone-400">لا مواعيد.</p>
      ) : (
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
      )}
    </div>
  )
}


/**
 * لوحة اليوم — غرفة عمليات الجمعية: قرار معلّق، مواعيد نظام، وكلاء يعملون.
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

  // Guests always see seeded demo data so first paint proves value.
  const useDemo = signedIn === false
  const viewData: Digest | DemoDigest = useDemo
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
  const isGuestDemo = useDemo
  const cal = viewData.calendar
  const zoom = viewData.zoom
  const isGuest = signedIn === false
  const demoTyped = isGuestDemo ? demo : null

  // A brand-new signed-in scope has nothing to show. Guide the first three
  // actions instead of stacking a dozen "لا مواعيد / لا مهام" cards.
  const isEmptyWorkspace =
    signedIn === true &&
    liveData !== null &&
    (liveData.commitments?.count || 0) === 0 &&
    (liveData.systemDeadlines || []).length === 0 &&
    (liveData.tasks?.openCount || 0) === 0 &&
    (liveData.calendar?.week || []).length === 0 &&
    (liveData.activity || []).length === 0 &&
    (liveData.recentPosts || []).length === 0


  return (
    <section className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 md:px-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ab-ink">لوحة اليوم</h1>
          <p className="mt-1 max-w-lg text-sm text-stone-500">
            ما الذي ينتظر قرارك، وما المواعيد النظامية، ومن يعمل الآن.
          </p>
          <DateDual className="mt-2" />
          {isGuestDemo && (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-ab-accent/10 px-2 py-0.5 text-[11px] font-medium text-ab-accent">
              معاينة تجريبية — بيانات حية للتجربة
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
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
          {!isGuest && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs text-stone-700 disabled:opacity-40"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
              تحديث
            </button>
          )}
          {isGuest && (
            <button
              type="button"
              onClick={() => onNavigate?.('settings')}
              className="rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs font-semibold text-ab-ink"
            >
              سجّل الدخول
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate?.('calendar')}
            className="rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs"
          >
            التقويم
          </button>
        </div>
      </header>

      {/* Ops cockpit — above the fold: قرار · نظام · وكلاء */}
      {(() => {
        const approvals = demoTyped?.pendingApprovals || []
        const livePending = !isGuestDemo ? pendingApprovalsCount : 0
        const deadlines = (viewData.systemDeadlines || []).slice(0, 4)
        const demoActs = demoTyped?.agentActivity || []
        const liveActs = [
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
        const acts = isGuestDemo ? demoActs : liveActs

        return (
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 lg:col-span-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-amber-950">
                  <ShieldCheck className="h-4 w-4" />
                  يحتاج قرارك
                  <span className="tabular-nums text-amber-800">
                    (
                    {isGuestDemo
                      ? approvals.length
                      : livePending}
                    )
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
              {isGuestDemo && approvals.length > 0 ? (
                <ul className="mt-2.5 space-y-2">
                  {approvals.slice(0, 3).map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200/80 bg-white/80 px-2.5 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-ab-ink">
                          {a.messageAr}
                        </p>
                        <p className="mt-0.5 text-[10px] text-amber-900/80">
                          {a.agentAr}
                          <span className="ms-1 rounded bg-amber-100 px-1 py-0.5 font-medium">
                            {a.riskLevel === 'HIGH' ? 'عالي' : 'منخفض'}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate?.('approvals')}
                        className="shrink-0 rounded-md bg-amber-900 px-2.5 py-1 text-[10px] font-semibold text-white"
                      >
                        مراجعة
                      </button>
                    </li>
                  ))}
                </ul>
              ) : livePending > 0 ? (
                <button
                  type="button"
                  onClick={() => onNavigate?.('approvals')}
                  className="mt-2.5 w-full rounded-lg border border-amber-200 bg-white/80 px-3 py-3 text-right text-[12px] font-semibold text-amber-950 hover:bg-white"
                >
                  {livePending} موافقة معلّقة — افتح صندوق HITL للاعتماد أو الرفض
                </button>
              ) : (
                <p className="mt-3 text-xs text-amber-900/70">
                  لا موافقات معلّقة الآن. الإجراءات الحساسة تظهر هنا قبل التنفيذ.
                </p>
              )}
            </div>

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
              {deadlines.length === 0 ? (
                <p className="mt-3 text-xs text-stone-400">
                  لا مواعيد ترخيص أو إفصاح ظاهرة — أضفها من التقويم.
                </p>
              ) : (
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
              )}
            </div>

            <div className="rounded-xl border border-ab-border bg-white p-3.5 lg:col-span-3">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                <Radio className="h-4 w-4 text-ab-accent" />
                يعمل الآن
              </h2>
              {acts.length === 0 ? (
                <p className="mt-3 text-xs text-stone-400">
                  لا وكلاء نشطين — افتح غرفة لتشغيل مهمة.
                </p>
              ) : (
                <ul className="mt-2.5 space-y-2">
                  {acts.slice(0, 3).map((a, i) => (
                    <li key={`${a.agentAr}-${i}`} className="text-[12px]">
                      <p className="font-semibold text-ab-ink">{a.agentAr}</p>
                      <p className="text-[11px] text-ab-accent">{a.statusAr}</p>
                      <p className="text-[10px] text-stone-500">{a.detailAr}</p>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => onNavigate?.('chats')}
                className="mt-3 text-[11px] font-medium text-ab-accent underline"
              >
                الغرف
              </button>
            </div>
          </div>
        )
      })()}

      {isGuest && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ab-ink">
              وضع الزائر — جلسة على هذا الجهاز فقط
            </p>
            <p className="mt-0.5 max-w-xl text-[12px] text-amber-950/70">
              المعاينة تُظهر دورة جمعية: موافقات، ترخيص، وكلاء. البيانات أدناه
              تجريبية ولن تُحفظ على السحابة. سجّل الدخول لحفظ الغرف وربط Drive
              وتيليجرام وتنفيذ الموافقات.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('settings')}
              className="rounded-md bg-ab-accent px-3 py-2 text-xs font-semibold text-white"
            >
              سجّل الدخول
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('approvals')}
              className="rounded-md border border-ab-border bg-white px-3 py-2 text-xs"
            >
              معاينة الموافقات
            </button>
          </div>
        </div>
      )}

      {!isGuest && signedIn === true && !isEmptyWorkspace && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-[12px] text-emerald-900">
          جلسة مسجّلة — الغرف والموافقات والربط بـ Drive/تيليجرام تُحفظ لحسابك.
        </div>
      )}

      {isEmptyWorkspace && (
        <div className="space-y-3 rounded-xl border border-ab-accent/25 bg-ab-accent/5 p-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-base font-bold text-ab-ink">
              <Rocket className="h-4 w-4 text-ab-accent" aria-hidden />
              مساحتك جاهزة — ابدأ بثلاث خطوات
            </h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-stone-600">
              اللوحة فارغة لأن هذه الغرفة جديدة، وليست معطّلة. أكمل الخطوات
              أدناه لتظهر المواعيد والمهام وسجل التدقيق تلقائياً.
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
                ٢. زامن عقل الشركة
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
                فهرسة مجلد Drive حتى يجيب الوكيل من ملفاتكم لا من تخمينه.
              </p>
              <button
                type="button"
                onClick={() => onNavigate?.('settings')}
                className="mt-2 rounded-md border border-ab-border px-2.5 py-1 text-[11px] font-medium text-ab-ink"
              >
                عقل الشركة
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

      <AssociationRecipes onNavigate={onNavigate} />

      {err && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {err}
        </p>
      )}

      {busy && !liveData && !isGuest && !isGuestDemo && (
        <p className="text-sm text-stone-500">جاري تحميل لوحة اليوم…</p>
      )}

      {!isEmptyWorkspace && (
        <>
        {/* Zoom strip */}
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3',
            zoom?.liveNow
              ? 'border-red-200 bg-red-50'
              : 'border-ab-border bg-ab-surface'
          )}
        >
          <div className="flex items-center gap-2">
            <Video
              className={cn(
                'h-5 w-5',
                zoom?.liveNow ? 'text-red-600' : 'text-stone-400'
              )}
            />
            <div>
              <p className="text-sm font-bold text-ab-ink">
                {zoom?.liveNow
                  ? `Zoom مباشر الآن (${zoom.liveCount})`
                  : 'Zoom غير مباشر الآن'}
              </p>
              <p className="text-[11px] text-stone-500">
                {zoom?.liveNow
                  ? ('liveMeetings' in (zoom || {}) &&
                    Array.isArray((zoom as { liveMeetings?: Array<{ topic: string }> }).liveMeetings) &&
                    (zoom as { liveMeetings?: Array<{ topic: string }> }).liveMeetings?.[0]
                      ?.topic) ||
                    zoom.messageAr
                  : zoom?.messageAr ||
                    (zoom?.lastLiveAtAr
                      ? `آخر بث: ${zoom.lastLiveAtAr}`
                      : 'لا سجل بث بعد')}
              </p>
            </div>
          </div>
          {zoom?.liveNow && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-bold text-white">
              <Radio className="h-3 w-3 animate-pulse" />
              LIVE
            </span>
          )}
        </div>

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

        <div className="rounded-xl border border-ab-border bg-white p-4">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
            <ListTodo className="h-4 w-4 text-ab-accent" />
            التزامات هذا الأسبوع
          </h2>
          <p className="mb-3 text-[11px] text-stone-500">
            من المهام + المواعيد + مواعيد النظام ({viewData.commitments?.count || 0})
          </p>
          {(viewData.commitments?.items || []).length === 0 ? (
            <p className="text-xs text-stone-400">
              لا التزامات ظاهرة — أضف مهاماً أو مواعيد نظام من التقويم.
            </p>
          ) : (
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
          )}
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

        <div className="rounded-xl border border-ab-border bg-ab-surface p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
            <Clock className="h-4 w-4 text-ab-accent" />
            أحداث هذا الأسبوع
          </h2>
          {(cal?.week || []).length === 0 ? (
            <p className="text-xs text-stone-400">لا أحداث مسجّلة لهذا الأسبوع.</p>
          ) : (
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
          )}
        </div>

        {/* Mini audit preview */}
        {demoTyped?.auditEntries && (
          <div className="rounded-xl border border-ab-border bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                <Fingerprint className="h-4 w-4 text-ab-accent" />
                سجل التدقيق (سدايا)
              </h2>
              <button
                type="button"
                onClick={() => onNavigate?.('audit')}
                className="text-[11px] text-ab-accent underline"
              >
                العرض الكامل
              </button>
            </div>
            <p className="mb-2 text-[11px] text-stone-500">
              ختم لكل إجراء — جاهز للمراجعة دون تصدير منفصل.
            </p>
            <ul className="space-y-2">
              {demoTyped.auditEntries.slice(0, 4).map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-ab-border/70 px-2.5 py-2 text-[12px]"
                >
                  <p className="font-semibold text-ab-ink">
                    {a.actorAr}
                    <span className="mr-1 font-normal text-stone-500">
                      · {a.actionAr}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-stone-400">
                    {a.atAr} · {a.riskTier}
                    <span className="mr-1 font-mono" dir="ltr">
                      · {a.watermarkHint}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-ab-border bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
              <Users className="h-4 w-4 text-ab-accent" />
              من كانوا هنا وماذا عملوا
            </h2>
            {(viewData.people || []).length === 0 ? (
              <p className="text-xs text-stone-400">
                سيظهر هنا من فتح الغرفة أو عدّل أو أرسل رسالة.
              </p>
            ) : (
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
            )}
          </div>

          <div className="rounded-xl border border-ab-border bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
              <Pencil className="h-4 w-4 text-ab-accent" />
              آخر التعديلات
            </h2>
            {(viewData.activity || []).length === 0 ? (
              <p className="text-xs text-stone-400">لا تعديلات مسجّلة بعد.</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-auto">
                {(viewData.activity || []).slice(0, 15).map((a) => (
                  <li key={a.id} className="text-[12px] leading-snug text-stone-600">
                    <span className="font-semibold text-ab-ink">{a.actorAr}</span>
                    {' · '}
                    {a.actionAr}
                    {a.detailAr ? ` — ${a.detailAr}` : ''}
                    <span className="text-stone-400"> · {a.atAr}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-ab-border bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
              <History className="h-4 w-4 text-ab-accent" />
              آخر الرسائل
            </h2>
            {(viewData.recentPosts || []).length === 0 ? (
              <p className="text-xs text-stone-400">لا رسائل حديثة.</p>
            ) : (
              <ul className="space-y-2">
                {(viewData.recentPosts || []).map((p, i) => (
                  <li key={`${p.atAr}-${i}`} className="text-[12px] text-stone-600">
                    <span className="font-semibold text-ab-ink">{p.authorAr}</span>
                    {' · '}
                    {p.content}
                    <span className="text-stone-400"> · {p.atAr}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-ab-border bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
              <ListTodo className="h-4 w-4 text-ab-accent" />
              مهام مفتوحة ({viewData.tasks?.openCount || 0})
            </h2>
            {(viewData.tasks?.items || []).length === 0 ? (
              <p className="text-xs text-stone-400">لا مهام مفتوحة.</p>
            ) : (
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
            )}
            <button
              type="button"
              onClick={() => onNavigate?.('calendar')}
              className="mt-3 text-[11px] text-ab-accent underline"
            >
              عرض لوحة المهام في التقويم
            </button>
          </div>
        </div>
        </>
      )}

    </section>
  )
}
