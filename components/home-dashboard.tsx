'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock,
  History,
  Inbox,
  Radio,
  RefreshCw,
  ShieldCheck,
  Users,
  Video,
  ListTodo,
  Rocket,
  Bot,
  Compass,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { useWorkspaceModeStore } from '@/lib/scopes/workspace-mode-store'
import { buildGuestDemoDigest, type DemoDigest } from '@/lib/demo/guest-digest'
import { AssociationRecipes } from '@/components/association-recipes'
import { FirstRunChecklist } from '@/components/first-run-checklist'
import { DateDual } from '@/components/date-dual'
import { TelegramHomePanel } from '@/components/telegram-home-panel'
import {
  ActivityHistoryDialog,
  type ActivityFeedItem,
} from '@/components/activity-history-dialog'
import { cn } from '@/lib/utils'

type CalEvent = {
  id: string
  titleAr: string
  startsAtAr: string
  endsAtAr: string
  hasZoom?: boolean
  locationAr?: string | null
  source?: string
  createdByAr?: string | null
}

type Activity = {
  id: string
  actorAr: string
  actionAr: string
  detailAr?: string | null
  atAr: string
  kind: string
  createdAt?: string
}

type Person = {
  nameAr: string
  email?: string | null
  actions: number
  lastAction: string
  lastAtAr: string
}

type TeamInboxItem = {
  id: string
  kind: 'task' | 'invite' | 'event' | 'hitl' | 'deadline' | 'channel'
  titleAr: string
  detailAr?: string | null
  whenAtAr?: string | null
  hrefHint?: string
}

type Digest = {
  days?: { yesterday: string; today: string; tomorrow: string; dayAfter: string }
  agenda?: Array<{
    offset: number
    ymd: string
    labelAr: string
    weekdayAr?: string
    events: CalEvent[]
  }>
  monthRest?: Array<{
    offset: number
    ymd: string
    labelAr: string
    weekdayAr?: string
    events: CalEvent[]
  }>
  beyondMonthCount?: number
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
  recentPosts?: Array<{
    id?: string
    authorAr: string
    content: string
    atAr: string
    at?: number
    kind: string
  }>
  messageAr?: string
}

const INBOX_KIND_AR: Record<TeamInboxItem['kind'], string> = {
  task: 'مهمة',
  invite: 'دعوة',
  event: 'موعد',
  hitl: 'موافقة',
  deadline: 'امتثال',
  channel: 'قناة',
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
        'rounded-xl border border-ab-border bg-white p-3.5 shadow-ab-sm',
        accent
      )}
    >
      <p className="text-sm font-bold text-ab-ink">{title}</p>
      {subtitle && (
        <p className="text-[10px] text-ab-muted-soft">{subtitle}</p>
      )}
      {events.length === 0 ? (
        <p className="mt-3 text-[12px] text-ab-muted">لا مواعيد — أضف من التقويم</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="rounded-lg border border-ab-border/70 bg-stone-50/80 px-2.5 py-2"
            >
              <p className="text-[13px] font-semibold text-ab-ink">{e.titleAr}</p>
              <p className="mt-0.5 text-[10px] text-ab-muted">
                {e.startsAtAr}
                {e.hasZoom ? ' · Zoom' : ''}
                {e.locationAr ? ` · ${e.locationAr}` : ''}
              </p>
              {e.source === 'google_sync' && (
                <p className="mt-0.5 text-[10px] text-sky-800">
                  من Google
                  {e.createdByAr ? ` · ${e.createdByAr}` : ''}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** صف مضغوط لموعد في باقي الشهر */
function MonthRestRow({
  labelAr,
  event,
}: {
  labelAr: string
  event: CalEvent
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-stone-500">{labelAr}</p>
        <p className="truncate text-[12px] font-medium text-ab-ink">
          {event.titleAr}
        </p>
      </div>
      <p className="shrink-0 text-[10px] text-stone-400">
        {event.startsAtAr}
        {event.hasZoom ? ' · Zoom' : ''}
      </p>
    </li>
  )
}


/**
 * لوحة اليوم — غرفة عمليات الفريق: قرار معلّق، مواعيد، وكلاء يعملون.
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
  const canAccessOpsUi = useWorkspaceModeStore((s) => s.canAccessOpsUi)
  const [liveData, setLiveData] = useState<Digest | null>(null)
  const [teamInbox, setTeamInbox] = useState<TeamInboxItem[]>([])
  const [mailUnread, setMailUnread] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [activityOpen, setActivityOpen] = useState(false)
  const demo = useMemo(() => buildGuestDemoDigest(), [])

  const load = useCallback(async () => {
      if (signedIn !== true) {
      setBusy(false)
      setLiveData(null)
      setTeamInbox([])
      setMailUnread(null)
      setErr('')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const headers = await authHeaders()
      const [res, inboxRes, mailRes] = await Promise.all([
        fetch(`/api/rooms/home?scopeId=${encodeURIComponent(scopeId)}`, {
          headers,
        }),
        fetch(`/api/rooms/inbox?scopeId=${encodeURIComponent(scopeId)}`, {
          headers,
        }).catch(() => null),
        fetch('/api/mail/messages?limit=1', { headers }).catch(() => null),
      ])
      const json = (await res.json()) as Digest & {
        error?: string
        code?: string
      }
      if (!res.ok) {
        if (res.status === 401 || json.code === 'AUTH_REQUIRED') {
          setLiveData(null)
          setTeamInbox([])
          setMailUnread(null)
          setErr('')
          return
        }
        throw new Error(json.error || 'فشل التحميل')
      }
      setLiveData(json)
      if (inboxRes?.ok) {
        const inboxJson = (await inboxRes.json()) as {
          items?: TeamInboxItem[]
        }
        setTeamInbox(inboxJson.items || [])
      } else {
        setTeamInbox([])
      }
      if (mailRes?.ok) {
        const mailJson = (await mailRes.json()) as {
          unread?: number
          configured?: boolean
        }
        setMailUnread(
          mailJson.configured ? Number(mailJson.unread || 0) : null
        )
      } else {
        setMailUnread(null)
      }
      // Soft Google→room sync only when the member opted in (avoids SYNC_DISABLED 400 noise).
      void (async () => {
        try {
          const prefRes = await fetch(
            `/api/rooms/calendar/sync?scopeId=${encodeURIComponent(scopeId)}`,
            { headers: await authHeaders() }
          )
          if (!prefRes.ok) return
          const pref = (await prefRes.json()) as {
            calendarSyncEnabled?: boolean
          }
          if (!pref.calendarSyncEnabled) return
          const syncRes = await fetch('/api/rooms/calendar/sync', {
            method: 'POST',
            headers: await authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ action: 'sync_now', scopeId }),
          })
          if (!syncRes.ok) return
          const syncJson = (await syncRes.json()) as {
            created?: number
            updated?: number
            cancelled?: number
          }
          const changed =
            (syncJson.created || 0) +
              (syncJson.updated || 0) +
              (syncJson.cancelled || 0) >
            0
          if (!changed) return
          const again = await fetch(
            `/api/rooms/home?scopeId=${encodeURIComponent(scopeId)}`,
            { headers: await authHeaders() }
          )
          if (again.ok) {
            setLiveData((await again.json()) as Digest)
          }
        } catch {
          /* soft fail */
        }
      })()
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
              atMs: a.createdAt ? new Date(a.createdAt).getTime() : Date.now(),
              atAr: a.atAr,
              id: a.id,
            })),
        ]

  /** Full feed for the activity modal (home shows only a 5-item preview). */
  const activityFeed: ActivityFeedItem[] = useMemo(() => {
    if (isGuest || authPending) return []
    const now = Date.now()
    const liveIds = new Set(acts.map((a) => a.id).filter(Boolean))
    const live: ActivityFeedItem[] = acts.map((a, i) => ({
      id: a.id || `live-${i}`,
      actorAr: a.agentAr,
      actionAr: a.statusAr,
      detailAr: a.detailAr,
      atAr: a.atAr,
      atMs: a.atMs || now,
      badge: 'الآن' as const,
    }))
    const fromLog: ActivityFeedItem[] = (viewData.activity || [])
      .filter((a) => !liveIds.has(a.id))
      .map((a) => ({
        id: a.id,
        actorAr: a.actorAr,
        actionAr: a.actionAr,
        detailAr: a.detailAr,
        atAr: a.atAr,
        atMs: a.createdAt ? new Date(a.createdAt).getTime() : 0,
        badge: null,
      }))
    const fromPosts: ActivityFeedItem[] = (viewData.recentPosts || []).map(
      (p, i) => ({
        id: p.id || `post-${p.atAr}-${i}`,
        actorAr: p.authorAr,
        actionAr: p.content,
        detailAr: null,
        atAr: p.atAr,
        atMs: typeof p.at === 'number' ? p.at : 0,
        badge: 'رسالة' as const,
      })
    )
    const seen = new Set<string>()
    const merged: ActivityFeedItem[] = []
    for (const item of [...live, ...fromLog, ...fromPosts]) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      merged.push(item)
    }
    return merged.sort((a, b) => (b.atMs || 0) - (a.atMs || 0))
  }, [acts, authPending, isGuest, viewData.activity, viewData.recentPosts])

  const activityPreview = activityFeed.slice(0, 5)

  const hasDayEvents =
    !authPending &&
    ((viewData.agenda || []).some((d: { events: CalEvent[] }) => d.events.length > 0) ||
      (cal?.yesterday || []).length +
        (cal?.today || []).length +
        (cal?.tomorrow || []).length +
        (cal?.dayAfter || []).length >
        0)
  const agendaDays: Array<{
    offset: number
    ymd: string
    labelAr: string
    weekdayAr?: string
    events: CalEvent[]
  }> =
    viewData.agenda && viewData.agenda.length > 0
      ? viewData.agenda
      : [
          {
            offset: 0,
            ymd: viewData.days?.today || '',
            labelAr: 'اليوم',
            weekdayAr: undefined,
            events: cal?.today || [],
          },
          {
            offset: 1,
            ymd: viewData.days?.tomorrow || '',
            labelAr: 'غداً',
            weekdayAr: undefined,
            events: cal?.tomorrow || [],
          },
          {
            offset: 2,
            ymd: viewData.days?.dayAfter || '',
            labelAr: 'بعد غد',
            weekdayAr: undefined,
            events: cal?.dayAfter || [],
          },
        ]
  const hasCommitments =
    !authPending && (viewData.commitments?.items || []).length > 0
  // Week list overlaps commitments (same events) — only show when no commitments block.
  const hasWeek =
    !authPending && !hasCommitments && (cal?.week || []).length > 0
  const hasPeople = !authPending && (viewData.people || []).length > 0
  const hasMergedPulse = !authPending && activityFeed.length > 0
  const hasTasks = !authPending && (viewData.tasks?.items || []).length > 0
  const showZoomStrip = !authPending && Boolean(zoom?.liveNow)
  const showCockpit =
    !isGuest && !authPending && (livePending > 0 || deadlines.length > 0)
  // اليوم + غداً — لوحات كبيرة دائماً
  const focusAgendaDays = agendaDays.filter((d) => d.offset === 0 || d.offset === 1)
  // باقي الشهر الحالي فقط (من الـ API أو من agenda القديمة كاحتياط)
  const liveDigest = liveData as Digest | null
  const monthRestDays =
    liveDigest?.monthRest && liveDigest.monthRest.length > 0
      ? liveDigest.monthRest.filter((d) => d.events.length > 0)
      : agendaDays.filter((d) => d.offset >= 2 && d.events.length > 0)
  const beyondMonthCount = liveDigest?.beyondMonthCount || 0

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
            بعد الدخول: اكتب «وش تبي؟» من «المساعدون»، ثم المواعيد والمهام
            والموافقات الحقيقية — بلا بيانات وهمية.
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
              onClick={() => onNavigate?.('assistants')}
              className="rounded-md border border-ab-border bg-white px-3 py-2 text-xs font-medium text-ab-ink"
            >
              وش تبي؟
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="ab-page pb-24" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ab-title">لوحة اليوم</h1>
          <p className="ab-subtitle">
            مواعيد اليوم والأيام القادمة أولاً — ثم ما ينتظر قرارك ومن يعمل الآن.
          </p>
          <DateDual className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-2">
          {mailUnread != null && (
            <button
              type="button"
              onClick={() => onNavigate?.('mail')}
              className="ab-btn-secondary"
            >
              <Inbox className="h-3.5 w-3.5 text-ab-accent" aria-hidden />
              البريد
              {mailUnread > 0 ? (
                <span className="ab-badge-accent tabular-nums">
                  {mailUnread}
                </span>
              ) : (
                <span className="text-ab-muted-soft">٠</span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate?.('calendar')}
            className="ab-btn-primary"
          >
            أضف موعد
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className="ab-btn-ghost"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
            تحديث
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('calendar')}
            className="ab-btn-secondary"
          >
            التقويم
          </button>
        </div>
      </header>

      {/* مساعد العمل — single composer entry */}
      <div className="ab-composer bg-gradient-to-l from-ab-accent/[0.09] via-white to-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ab-accent/15 text-ab-accent">
                <Bot className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ab-ink sm:text-xl">
                  وش تبي؟
                </h2>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ab-muted sm:text-[13px]">
                  اكتب طلبك — بريد · تقويم · ملفات · تيليجرام. مهام متعددة تدخل
                  الطابور وتعمل معاً حتى الحد.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.('assistants')}
            className="ab-btn-primary px-3.5 py-2 text-[12px]"
          >
            <Compass className="h-3.5 w-3.5" aria-hidden />
            افتح المساعدين
          </button>
        </div>
      </div>

      {!authPending && <TelegramHomePanel />}

      {!authPending && teamInbox.length > 0 && (
        <div className="rounded-xl border border-ab-border bg-white p-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
              <Inbox className="h-4 w-4 text-ab-accent" />
              وارد الفريق
              <span className="text-[11px] font-normal text-stone-500">
                ({teamInbox.length})
              </span>
            </h2>
          </div>
          <ul className="space-y-2">
            {teamInbox.slice(0, 10).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    const hint = item.hrefHint || ''
                    if (hint.startsWith('invite/')) {
                      window.location.href = `/${hint}`
                      return
                    }
                    if (hint === 'calendar:tasks' || hint.includes('tasks')) {
                      onNavigate?.('calendar:tasks')
                      return
                    }
                    if (hint === 'approvals') {
                      onNavigate?.('approvals')
                      return
                    }
                    if (hint === 'settings') {
                      onNavigate?.('settings')
                      return
                    }
                    if (hint === 'team') {
                      onNavigate?.('chats')
                      return
                    }
                    onNavigate?.('calendar')
                  }}
                  className="flex w-full items-start justify-between gap-2 rounded-lg border border-ab-border/70 bg-stone-50/80 px-2.5 py-2 text-right hover:bg-stone-50"
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-ab-ink">
                      {(() => {
                        const kindAr = INBOX_KIND_AR[item.kind]
                        const title = item.titleAr.trim()
                        const stripped = title
                          .replace(new RegExp(`^${kindAr}[\\s·\\-–—]+`), '')
                          .trim()
                        return (
                          <>
                            <span className="me-1.5 text-[10px] font-medium text-stone-500">
                              {kindAr}
                            </span>
                            {stripped || title}
                          </>
                        )
                      })()}
                    </p>
                    {(item.detailAr || item.whenAtAr) && (
                      <p className="mt-0.5 text-[10px] text-stone-500">
                        {[item.whenAtAr, item.detailAr].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!authPending && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
              <CalendarDays className="h-4 w-4 text-ab-accent" />
              تقويم الفريق · الأيام القادمة
              {hasDayEvents ? (
                <span className="text-[11px] font-normal text-stone-500">
                  · مشترك للجميع
                </span>
              ) : null}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate?.('calendar:full')}
                className="text-[11px] font-semibold text-ab-accent underline"
              >
                التقويم الكامل
              </button>
              <button
                type="button"
                onClick={() => onNavigate?.('calendar')}
                className="text-[11px] font-semibold text-stone-500 underline"
              >
                فتح تقويم الفريق
              </button>
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {focusAgendaDays.map((d) => (
                <DayBlock
                  key={`${d.offset}-${d.ymd}`}
                  title={d.labelAr}
                  subtitle={d.weekdayAr || d.ymd}
                  events={d.events}
                  accent={
                    d.offset === 0 ? 'ring-1 ring-ab-accent/30' : undefined
                  }
                />
              ))}
            </div>
            {monthRestDays.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-stone-500">
                  باقي هذا الشهر
                </p>
                <ul className="divide-y divide-ab-border overflow-hidden rounded-xl border border-ab-border bg-white">
                  {monthRestDays.flatMap((d) =>
                    d.events.map((e) => (
                      <MonthRestRow
                        key={e.id}
                        labelAr={d.weekdayAr || d.labelAr || d.ymd}
                        event={e}
                      />
                    ))
                  )}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ab-border bg-stone-50/70 px-3 py-2">
              <p className="text-[11px] text-stone-600">
                {beyondMonthCount > 0
                  ? `${beyondMonthCount} موعد بعد هذا الشهر`
                  : 'كل الأشهر في التقويم الكامل'}
              </p>
              <button
                type="button"
                onClick={() => onNavigate?.('calendar:full')}
                className="shrink-0 rounded-md bg-ab-ink px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                التقويم الكامل
              </button>
            </div>
            {!hasDayEvents && monthRestDays.length === 0 && (
              <p className="text-[11px] text-stone-400">
                لا مواعيد قادمة —{' '}
                <button
                  type="button"
                  onClick={() => onNavigate?.('calendar')}
                  className="font-semibold text-ab-accent underline"
                >
                  أضف موعداً
                </button>
              </p>
            )}
          </div>
        </div>
      )}

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
                {livePending} طلب حذف معلّق — افتح صندوق الموافقات للاعتماد أو
                الرفض
              </button>
            </div>
          )}

          {deadlines.length > 0 && (
            <div className="rounded-xl border border-ab-border bg-white p-3.5 lg:col-span-7">
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
        </div>
      )}

      {signedIn === true && !isEmptyWorkspace && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-[12px] text-emerald-900">
          {canAccessOpsUi
            ? 'جلسة مسجّلة — الغرف والموافقات والربط بـ Drive/تيليجرام تُحفظ لحسابك.'
            : 'جلسة مسجّلة — غرفك وتقويمك ومهامك محفوظة لحسابك.'}
        </div>
      )}

      {isEmptyWorkspace && signedIn === true && (
        <div className="space-y-3 rounded-xl border border-ab-accent/25 bg-ab-accent/5 p-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-base font-bold text-ab-ink">
              <Rocket className="h-4 w-4 text-ab-accent" aria-hidden />
              {canAccessOpsUi
                ? 'مساحتك جاهزة — ابدأ بثلاث خطوات'
                : 'ابدأ من الغرف والعمل اليومي'}
            </h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-stone-600">
              {canAccessOpsUi
                ? 'اللوحة فارغة لأن هذه الغرفة جديدة. أكمل الخطوات أدناه لتظهر المواعيد والمهام تلقائياً.'
                : 'افتح غرفة الفريق، أضف موعداً أو مهمة، وتابع صندوق الوارد — بلا إعدادات تقنية.'}
            </p>
          </div>
          {canAccessOpsUi ? (
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
          ) : (
            <ol className="grid gap-2 sm:grid-cols-3">
              <li className="rounded-lg border border-ab-border bg-white p-3">
                <p className="text-[12px] font-semibold text-ab-ink">
                  ١. غرفة الفريق
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
                  غرفة واحدة للموظفين والوكلاء — شغّل أو أوقف «الوكلاء يعملون معنا».
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate?.('chats')}
                  className="mt-2 rounded-md bg-ab-ink px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  فتح غرفة الفريق
                </button>
              </li>
              <li className="rounded-lg border border-ab-border bg-white p-3">
                <p className="text-[12px] font-semibold text-ab-ink">
                  ٢. التقويم والمهام
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
                  مواعيد ومهام الفريق المشتركة تظهر للجميع هنا.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate?.('calendar')}
                  className="mt-2 rounded-md border border-ab-border px-2.5 py-1 text-[11px] font-medium text-ab-ink"
                >
                  التقويم
                </button>
              </li>
              <li className="rounded-lg border border-ab-border bg-white p-3">
                <p className="text-[12px] font-semibold text-ab-ink">٣. الملفات</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
                  ارفع أو افتح ملفات العمل عند الحاجة.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate?.('files')}
                  className="mt-2 rounded-md border border-ab-border px-2.5 py-1 text-[11px] font-medium text-ab-ink"
                >
                  الملفات
                </button>
              </li>
            </ol>
          )}
          {canAccessOpsUi ? (
            <FirstRunChecklist
              onNavigate={onNavigate}
              className="rounded-lg border border-ab-border bg-white p-3 text-sm"
            />
          ) : null}
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

          {hasCommitments && (
            <div className="rounded-xl border border-ab-border bg-white p-4">
              <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                <ListTodo className="h-4 w-4 text-ab-accent" />
                أسبوع الفريق
              </h2>
              <p className="mb-3 text-[11px] text-stone-500">
                مهام ومواعيد ومواعيد نظام ({viewData.commitments?.count || 0})
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

          {(hasPeople || hasMergedPulse || hasTasks) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {hasMergedPulse && (
                <div
                  className={cn(
                    'rounded-xl border border-ab-border bg-white p-3',
                    !hasPeople && !hasTasks && 'lg:col-span-2'
                  )}
                >
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                      <History className="h-4 w-4 text-ab-accent" />
                      نشاط حديث
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActivityOpen(true)}
                      className="text-[11px] font-semibold text-ab-accent underline"
                    >
                      كل النشاط
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {activityPreview.map((a) => (
                      <li
                        key={a.id}
                        className="text-[12px] leading-snug text-stone-600"
                      >
                        {a.badge ? (
                          <span
                            className={cn(
                              'me-1.5 rounded px-1 py-px text-[10px] font-semibold',
                              a.badge === 'الآن'
                                ? 'bg-ab-accent/10 text-ab-accent'
                                : 'bg-stone-100 font-medium text-stone-500'
                            )}
                          >
                            {a.badge}
                          </span>
                        ) : null}
                        <span className="font-semibold text-ab-ink">
                          {a.actorAr}
                        </span>
                        {' · '}
                        {a.actionAr}
                        {a.detailAr ? (
                          <span className="text-stone-400">
                            {' '}
                            — {a.detailAr}
                          </span>
                        ) : null}
                        {a.atAr ? (
                          <span className="text-stone-400"> · {a.atAr}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {hasPeople && (
                <div className="rounded-xl border border-ab-border bg-white p-4">
                  <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                    <Users className="h-4 w-4 text-ab-accent" />
                    من كانوا هنا
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

      <ActivityHistoryDialog
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        items={activityFeed}
      />
    </section>
  )
}
