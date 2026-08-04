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
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { buildGuestDemoDigest, type DemoDigest } from '@/lib/demo/guest-digest'
import { AssociationRecipes } from '@/components/association-recipes'
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
 * لوحة اليوم — نظرة سريعة على ما حدث وماذا سيحدث.
 */
export function HomeDashboard({
  onNavigate,
}: {
  onNavigate?: (section: string) => void
}) {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const signedIn = useSignedIn()
  const [liveData, setLiveData] = useState<Digest | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const demo = useMemo(() => buildGuestDemoDigest(), [])

  const load = useCallback(async () => {
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
  }, [scopeId])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(t)
  }, [load])

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


  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ab-ink">لوحة اليوم</h1>
          <p className="mt-1 text-sm text-stone-500">
            ماذا حدث أمس · ماذا يحدث اليوم · ماذا غداً وبعده — مع Zoom وآخر
            التعديلات والحضور.
          </p>
          {isGuestDemo && (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-ab-accent/10 px-2 py-0.5 text-[11px] font-medium text-ab-accent">
              معاينة تجريبية — بيانات حية للتجربة
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
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
              className="rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white"
            >
              سجّل الدخول
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate?.('calendar')}
            className="rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white"
          >
            التقويم الكامل
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('chats')}
            className="rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs"
          >
            الغرف
          </button>
        </div>
      </header>

      <AssociationRecipes onNavigate={onNavigate} />

      {/* Pending approvals strip */}
      {(demoTyped?.pendingApprovals?.length || 0) > 0 && (
        <button
          type="button"
          onClick={() => onNavigate?.('approvals')}
          className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-right transition-colors hover:bg-amber-100/80"
        >
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
            <div>
              <p className="text-sm font-bold text-amber-950">
                {demoTyped!.pendingApprovals.length} موافقة معلّقة
              </p>
              <p className="text-[11px] text-amber-900/80">
                {demoTyped!.pendingApprovals
                  .map((a) => `${a.agentAr}: ${a.messageAr}`)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <span className="rounded-md bg-amber-900 px-2.5 py-1 text-[10px] font-semibold text-white">
            مراجعة HITL
          </span>
        </button>
      )}

      {isGuest && (
        <div className="rounded-xl border border-ab-accent/25 bg-gradient-to-bl from-ab-accent/5 via-white to-emerald-50/50 px-4 py-5">
          <p className="text-base font-semibold text-ab-ink">
            مرحباً بك في Arabic Buzz
          </p>
          <p className="mt-1.5 max-w-xl text-sm text-stone-600">
            نظام تشغيل للجمعيات السعودية: غرف بشر ووكلاء، موافقات بشرية، سجل
            سدايا، وتقويم على الجوال. المعاينة أدناه تُظهر جمعية تعمل الآن —
            سجّل الدخول لحفظ جلستك وربط تيليجرام وDrive.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('settings')}
              className="rounded-md bg-ab-accent px-3 py-2 text-xs font-semibold text-white"
            >
              سجّل الدخول أو ابدأ تجريبياً
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('chats')}
              className="rounded-md border border-ab-border bg-white px-3 py-2 text-xs"
            >
              جرّب غرفة الفريق
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('audit')}
              className="rounded-md border border-ab-border bg-white px-3 py-2 text-xs"
            >
              سجل التدقيق
            </button>
          </div>
        </div>
      )}

      {/* Live agent activity — demo seed or signed-in digest */}
      {(() => {
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
            .slice(0, 4)
            .map((a) => ({
              agentAr: a.actorAr,
              statusAr: a.actionAr,
              detailAr: a.detailAr || a.atAr,
            })),
          ...(liveData?.recentPosts || [])
            .filter((p) => p.kind === 'agent')
            .slice(0, 4)
            .map((p) => ({
              agentAr: p.authorAr,
              statusAr: 'نشر في الغرفة',
              detailAr: p.content,
            })),
        ].slice(0, 6)
        const acts = isGuestDemo ? demoActs : liveActs
        if (!acts.length) return null
        return (
          <div className="rounded-xl border border-ab-border bg-white px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold text-stone-500">
              نشاط الوكلاء الآن
            </p>
            <ul className="flex flex-wrap gap-2">
              {acts.map((a, i) => (
                <li
                  key={`${a.agentAr}-${i}`}
                  className="rounded-lg border border-ab-accent/20 bg-ab-accent/5 px-2.5 py-1.5 text-[12px]"
                >
                  <span className="font-semibold text-ab-ink">{a.agentAr}</span>
                  <span className="text-ab-accent"> · {a.statusAr}</span>
                  <span className="block text-[10px] text-stone-500">
                    {a.detailAr}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      })()}

      {err && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {err}
        </p>
      )}

      {busy && !liveData && !isGuest && !isGuestDemo && (
        <p className="text-sm text-stone-500">جاري تحميل لوحة اليوم…</p>
      )}

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
                : zoom?.lastLiveAtAr
                  ? `آخر بث: ${zoom.lastLiveAtAr}`
                  : zoom?.messageAr || 'لا سجل بث بعد'}
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
                  <span className="text-stone-500">
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
                    {p.lastAction} · {p.actions} إجراء · {p.lastAtAr}
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
                  · {t.titleAr}
                  <span className="mr-1 text-[10px] text-stone-400">
                    ({t.status})
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
    </section>
  )
}
