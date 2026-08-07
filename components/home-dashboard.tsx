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

type StartStep = {
  titleAr: string
  detailAr: string
  ctaAr: string
  target: string
}

const OWNER_START_STEPS: StartStep[] = [
  {
    titleAr: 'اربط Google',
    detailAr: 'للدعوات الخارجية وملفات Drive — خطوة واحدة من الإعدادات.',
    ctaAr: 'الإعدادات',
    target: 'settings',
  },
  {
    titleAr: 'زامن ملفات الفريق',
    detailAr: 'فهرسة مجلد Drive حتى يجيب الوكيل من ملفاتكم لا من تخمينه.',
    ctaAr: 'الملفات',
    target: 'files',
  },
  {
    titleAr: 'أضف أول موعد أو مهمة',
    detailAr: 'من تقويم ومهام الفريق — تظهر فوراً في لوحة اليوم.',
    ctaAr: 'التقويم',
    target: 'calendar',
  },
]

const MEMBER_START_STEPS: StartStep[] = [
  {
    titleAr: 'غرفة الفريق',
    detailAr: 'الوكلاء متواجدون دائماً — اكتب @اسم_الوكيل فيبدأ العمل فوراً.',
    ctaAr: 'افتح الغرفة',
    target: 'chats',
  },
  {
    titleAr: 'التقويم والمهام',
    detailAr: 'مواعيد ومهام الفريق المشتركة تظهر للجميع هنا.',
    ctaAr: 'التقويم',
    target: 'calendar',
  },
  {
    titleAr: 'الملفات',
    detailAr: 'ارفع أو افتح ملفات العمل عند الحاجة.',
    ctaAr: 'الملفات',
    target: 'files',
  },
]

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

/**
 * لوحة يوم واحد — بطاقة واحدة وصفوف بخطوط شعرية،
 * بدون بطاقة داخل بطاقة، والوقت في عمود ثابت.
 */
function DayBlock({
  title,
  subtitle,
  events,
  isToday,
}: {
  title: string
  subtitle?: string
  events: CalEvent[]
  isToday?: boolean
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-white shadow-ab-sm',
        isToday ? 'border-ab-accent/35' : 'border-ab-border'
      )}
    >
      <div
        className={cn(
          'flex items-baseline justify-between gap-2 px-3.5 py-2.5',
          isToday && 'bg-ab-accent/[0.06]'
        )}
      >
        <p
          className={cn(
            'text-[13px] font-bold tracking-tight',
            isToday ? 'text-ab-accent' : 'text-ab-ink'
          )}
        >
          {title}
        </p>
        {subtitle && <p className="ab-meta shrink-0">{subtitle}</p>}
      </div>
      {events.length === 0 ? (
        <p className="border-t border-ab-hairline px-3.5 py-4 text-[12px] text-ab-muted-soft">
          لا مواعيد
        </p>
      ) : (
        <ul>
          {events.map((e) => (
            <li
              key={e.id}
              className="flex gap-3 border-t border-ab-hairline px-3.5 py-2.5"
            >
              <span className="w-14 shrink-0 pt-px text-[11px] font-semibold tabular-nums text-ab-muted">
                {e.startsAtAr}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-snug text-ab-ink">
                  {e.titleAr}
                </span>
                {(e.hasZoom || e.locationAr || e.source === 'google_sync') && (
                  <span className="ab-meta mt-0.5 block">
                    {[
                      e.hasZoom ? 'Zoom' : null,
                      e.locationAr || null,
                      e.source === 'google_sync' ? 'من Google' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </span>
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
    <li className="ab-row">
      <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
        <span className="w-16 shrink-0 text-[11px] font-semibold text-ab-muted-soft">
          {labelAr}
        </span>
        <span className="ab-row-title">{event.titleAr}</span>
      </span>
      <span className="ab-row-meta">
        {event.startsAtAr}
        {event.hasZoom ? ' · Zoom' : ''}
      </span>
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
      <section className="ab-page-narrow" dir="rtl">
        <header className="ab-page-head">
          <div>
            <h1 className="ab-title">لوحة اليوم</h1>
            <DateDual className="mt-1.5" />
          </div>
        </header>
        <div className="space-y-3" aria-hidden>
          <div className="h-20 animate-pulse rounded-xl bg-ab-stage" />
          <div className="h-32 animate-pulse rounded-xl bg-ab-stage" />
        </div>
      </section>
    )
  }

  // ── Guest: one clear login path, no empty chrome ──
  if (isGuest) {
    return (
      <section className="ab-page-narrow" dir="rtl">
        <header className="ab-page-head">
          <div>
            <h1 className="ab-title">لوحة اليوم</h1>
            <DateDual className="mt-1.5" />
          </div>
        </header>
        <div className="rounded-xl border border-ab-accent/25 bg-ab-accent/[0.05] p-5">
          <p className="text-base font-bold text-ab-ink">سجّل الدخول للعمل</p>
          <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-ab-muted">
            بعد الدخول تظهر مواعيد اليوم والمهام والموافقات الحقيقية. النقاش مع
            الفريق والوكلاء في «غرفة الفريق»، والتشغيل اليومي في «مهام التشغيل».
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.('settings')}
            className="ab-btn-primary mt-4 px-4 py-2 text-sm"
          >
            سجّل الدخول
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="ab-page pb-24" dir="rtl">
      <header className="ab-page-head">
        <div className="min-w-0">
          <h1 className="ab-title">لوحة اليوم</h1>
          <DateDual className="mt-1.5" />
        </div>
        <div className="ab-page-head-actions">
          {mailUnread != null && (
            <button
              type="button"
              onClick={() => onNavigate?.('mail')}
              className="ab-btn-ghost"
            >
              <Inbox className="h-3.5 w-3.5" aria-hidden />
              البريد
              {mailUnread > 0 ? (
                <span className="ab-badge-accent tabular-nums">
                  {mailUnread}
                </span>
              ) : null}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className="ab-btn-ghost"
            aria-label="تحديث اللوحة"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
            تحديث
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('calendar')}
            className="ab-btn-primary"
          >
            أضف موعد
          </button>
        </div>
      </header>

      {!authPending && <TelegramHomePanel />}

      {!authPending && teamInbox.length > 0 && (
        <section>
          <div className="ab-section-head">
            <h2 className="ab-section-title">
              <Inbox aria-hidden />
              وارد الفريق
              <span className="ab-section-count">{teamInbox.length}</span>
            </h2>
          </div>
          <ul className="ab-list">
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
                  className="ab-row !items-start"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="w-10 shrink-0 text-[10px] font-semibold text-ab-muted-soft">
                        {INBOX_KIND_AR[item.kind]}
                      </span>
                      <span className="ab-row-title !whitespace-normal">
                        {(() => {
                          const kindAr = INBOX_KIND_AR[item.kind]
                          const title = item.titleAr.trim()
                          return (
                            title
                              .replace(new RegExp(`^${kindAr}[\\s·\\-–—]+`), '')
                              .trim() || title
                          )
                        })()}
                      </span>
                    </span>
                    {(item.detailAr || item.whenAtAr) && (
                      <span className="ab-meta mt-0.5 block ps-12">
                        {[item.whenAtAr, item.detailAr]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!authPending && (
        <section>
          <div className="ab-section-head">
            <h2 className="ab-section-title">
              <CalendarDays aria-hidden />
              تقويم الفريق
            </h2>
            <button
              type="button"
              onClick={() => onNavigate?.('calendar:full')}
              className="ab-action"
            >
              التقويم الكامل
              {beyondMonthCount > 0 ? (
                <span className="ab-section-count">
                  {beyondMonthCount}+
                </span>
              ) : null}
            </button>
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {focusAgendaDays.map((d) => (
                <DayBlock
                  key={`${d.offset}-${d.ymd}`}
                  title={d.labelAr}
                  subtitle={d.weekdayAr || d.ymd}
                  events={d.events}
                  isToday={d.offset === 0}
                />
              ))}
            </div>
            {monthRestDays.length > 0 && (
              <div className="space-y-1.5">
                <p className="ab-meta font-semibold">باقي هذا الشهر</p>
                <ul className="ab-list">
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
            {!hasDayEvents && monthRestDays.length === 0 && (
              <p className="ab-meta">
                لا مواعيد قادمة.{' '}
                <button
                  type="button"
                  onClick={() => onNavigate?.('calendar')}
                  className="font-semibold text-ab-accent"
                >
                  أضف موعداً
                </button>
              </p>
            )}
          </div>
        </section>
      )}

      {showCockpit && (
        <div className="grid gap-3 lg:grid-cols-12">
          {livePending > 0 && (
            <button
              type="button"
              onClick={() => onNavigate?.('approvals')}
              className="group flex items-center gap-3 rounded-xl border border-amber-300/80 bg-amber-50/80 p-3.5 text-start transition-colors hover:bg-amber-50 lg:col-span-5"
            >
              <ShieldCheck
                className="h-5 w-5 shrink-0 text-amber-700"
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-amber-950">
                  يحتاج قرارك
                  <span className="ms-1.5 tabular-nums font-semibold text-amber-800">
                    {livePending}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-amber-900/80">
                  طلبات حذف معلّقة — اعتمد أو ارفض من صندوق الموافقات
                </span>
              </span>
            </button>
          )}

          {deadlines.length > 0 && (
            <div className="lg:col-span-7">
              <div className="ab-section-head">
                <h2 className="ab-section-title">
                  <CalendarDays aria-hidden />
                  مواعيد نظامية
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate?.('calendar')}
                  className="ab-action"
                >
                  التقويم
                </button>
              </div>
              <ul className="ab-list">
                {deadlines.map((d) => (
                  <li key={d.id} className="ab-row">
                    <span className="ab-row-title">{d.labelAr}</span>
                    <span
                      className={cn(
                        'ab-row-meta',
                        d.daysLeft < 0
                          ? '!font-semibold !text-ab-danger'
                          : d.daysLeft <= 14
                            ? '!font-semibold !text-ab-warn'
                            : undefined
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

      {isEmptyWorkspace && signedIn === true && (
        <div className="space-y-4 rounded-xl border border-ab-accent/25 bg-ab-accent/[0.05] p-4 sm:p-5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-ab-ink">
              <Rocket className="h-4 w-4 text-ab-accent" aria-hidden />
              {canAccessOpsUi
                ? 'مساحتك جاهزة — ابدأ من هنا'
                : 'ابدأ من الغرفة والعمل اليومي'}
            </h2>
            <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-ab-muted">
              {canAccessOpsUi
                ? 'اللوحة فارغة لأن الغرفة جديدة. أكمل الخطوات لتظهر المواعيد والمهام تلقائياً.'
                : 'افتح غرفة الفريق، أضف موعداً أو مهمة، وتابع الوارد. بلا إعدادات تقنية.'}
            </p>
          </div>
          <ol className="ab-list">
            {(canAccessOpsUi ? OWNER_START_STEPS : MEMBER_START_STEPS).map(
              (step, i) => (
                <li key={step.titleAr}>
                  <button
                    type="button"
                    onClick={() => onNavigate?.(step.target)}
                    className="ab-row !items-center"
                  >
                    <span className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-ab-accent/10 text-[11px] font-bold tabular-nums text-ab-accent"
                        aria-hidden
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-ab-ink">
                          {step.titleAr}
                        </span>
                        <span className="ab-meta mt-0.5 block">
                          {step.detailAr}
                        </span>
                      </span>
                    </span>
                    <span className="ab-action !px-0">{step.ctaAr}</span>
                  </button>
                </li>
              )
            )}
          </ol>
          {canAccessOpsUi ? (
            <FirstRunChecklist
              scopeId={scopeId}
              knownRoomPosts={
                Array.isArray(liveData?.recentPosts)
                  ? liveData.recentPosts.length
                  : 0
              }
              onNavigate={onNavigate}
              onDismiss={() => {
                try {
                  localStorage.setItem('ab-onboarded', '1')
                } catch {
                  /* ignore */
                }
              }}
              className="rounded-lg border border-ab-border bg-white p-3 text-sm"
            />
          ) : null}
        </div>
      )}

      {!isEmptyWorkspace && <AssociationRecipes onNavigate={onNavigate} />}

      {err && (
        <p className="ab-note-danger" role="alert">
          {err}
        </p>
      )}

      {busy && !liveData && (
        <div className="space-y-3" aria-hidden>
          <div className="h-24 animate-pulse rounded-xl bg-ab-stage" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-32 animate-pulse rounded-xl bg-ab-stage" />
            <div className="h-32 animate-pulse rounded-xl bg-ab-stage" />
          </div>
        </div>
      )}

      {!isEmptyWorkspace && (
        <>
          {showZoomStrip && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/80 px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Video className="h-4 w-4 shrink-0 text-red-700" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-ab-ink">
                    Zoom مباشر الآن
                    <span className="ms-1.5 tabular-nums text-red-700">
                      {zoom?.liveCount}
                    </span>
                  </p>
                  <p className="ab-meta truncate">
                    {(() => {
                      const live = zoom as
                        | { liveMeetings?: Array<{ topic: string }> }
                        | undefined
                      return (
                        live?.liveMeetings?.[0]?.topic || zoom?.messageAr || ''
                      )
                    })()}
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold text-white">
                <Radio className="h-3 w-3 animate-pulse" aria-hidden />
                LIVE
              </span>
            </div>
          )}

          {hasCommitments && (
            <section>
              <div className="ab-section-head">
                <h2 className="ab-section-title">
                  <ListTodo aria-hidden />
                  أسبوع الفريق
                  <span className="ab-section-count">
                    {viewData.commitments?.count || 0}
                  </span>
                </h2>
              </div>
              <ul className="ab-list">
                {(viewData.commitments?.items || []).map((c) => (
                  <li key={c.id} className="ab-row">
                    <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
                      <span className="w-10 shrink-0 text-[10px] font-semibold text-ab-muted-soft">
                        {c.kind === 'task'
                          ? 'مهمة'
                          : c.kind === 'deadline'
                            ? 'نظام'
                            : 'موعد'}
                      </span>
                      <span className="ab-row-title">{c.titleAr}</span>
                    </span>
                    <span className="ab-row-meta">
                      {c.whenAtAr}
                      {c.detailAr ? ` · ${c.detailAr}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hasWeek && (
            <section>
              <div className="ab-section-head">
                <h2 className="ab-section-title">
                  <Clock aria-hidden />
                  أحداث هذا الأسبوع
                </h2>
              </div>
              <ul className="ab-list">
                {(cal?.week || []).map((e) => (
                  <li key={e.id} className="ab-row">
                    <span className="ab-row-title">{e.titleAr}</span>
                    <span className="ab-row-meta">
                      {e.startsAtAr}
                      {e.hasZoom ? ' · Zoom' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(hasPeople || hasMergedPulse || hasTasks) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {hasMergedPulse && (
                <section
                  className={cn(!hasPeople && !hasTasks && 'lg:col-span-2')}
                >
                  <div className="ab-section-head">
                    <h2 className="ab-section-title">
                      <History aria-hidden />
                      نشاط حديث
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActivityOpen(true)}
                      className="ab-action"
                    >
                      كل النشاط
                    </button>
                  </div>
                  <ul className="ab-list">
                    {activityPreview.map((a) => (
                      <li
                        key={a.id}
                        className="px-3 py-2 text-[12px] leading-relaxed text-ab-muted"
                      >
                        {a.badge === 'الآن' ? (
                          <span className="ab-badge-accent me-1.5">الآن</span>
                        ) : null}
                        <span className="font-semibold text-ab-ink">
                          {a.actorAr}
                        </span>
                        {' · '}
                        {a.actionAr}
                        {a.detailAr ? (
                          <span className="text-ab-muted-soft">
                            {' · '}
                            {a.detailAr}
                          </span>
                        ) : null}
                        {a.atAr ? (
                          <span className="text-ab-muted-soft tabular-nums">
                            {' · '}
                            {a.atAr}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {hasPeople && (
                <section>
                  <div className="ab-section-head">
                    <h2 className="ab-section-title">
                      <Users aria-hidden />
                      من كانوا هنا
                    </h2>
                  </div>
                  <ul className="ab-list">
                    {(viewData.people || []).map((p) => (
                      <li
                        key={`${p.nameAr}-${p.email || ''}`}
                        className="px-3 py-2.5"
                      >
                        <p className="text-[13px] font-semibold text-ab-ink">
                          {p.nameAr}
                        </p>
                        <p className="ab-meta mt-0.5">
                          {[p.lastAction, `${p.actions} إجراء`, p.lastAtAr]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {hasTasks && (
                <section>
                  <div className="ab-section-head">
                    <h2 className="ab-section-title">
                      <ListTodo aria-hidden />
                      مهام مفتوحة
                      <span className="ab-section-count">
                        {viewData.tasks?.openCount || 0}
                      </span>
                    </h2>
                    <button
                      type="button"
                      onClick={() => onNavigate?.('calendar:tasks')}
                      className="ab-action"
                    >
                      لوحة المهام
                    </button>
                  </div>
                  <ul className="ab-list">
                    {(viewData.tasks?.items || []).map((t) => (
                      <li key={t.id} className="ab-row">
                        <span className="ab-row-title">{t.titleAr}</span>
                        <span className="ab-row-meta">
                          {taskStatusAr(t.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
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
