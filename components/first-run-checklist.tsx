'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Circle, Sparkles, X } from 'lucide-react'
import {
  authHeaders,
  ensureSupabaseBrowserConfig,
} from '@/lib/supabase/browser'

type Step = {
  id: string
  labelAr: string
  done: boolean
  action?: () => void
  actionLabelAr?: string
}

const STATUS_TIMEOUT_MS = 4500

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.then((v) => v).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

/**
 * Multi-step first-run checklist (Google, Drive, keys, first message).
 * Auto-hides for active owners once room history or linked services are detected.
 */
export function FirstRunChecklist({
  onNavigate,
  onDismiss,
  className,
  /** Room already has chat history in this session — skip waiting on /api/rooms/home. */
  knownRoomPosts = 0,
  /** Active workspace scope — home digest must match the room the user is in. */
  scopeId,
}: {
  onNavigate?: (section: string) => void
  onDismiss?: () => void
  className?: string
  knownRoomPosts?: number
  scopeId?: string
}) {
  const [googleOk, setGoogleOk] = useState(false)
  const [driveCount, setDriveCount] = useState(0)
  const [keysOk, setKeysOk] = useState(false)
  const [telegramOk, setTelegramOk] = useState(false)
  const [loading, setLoading] = useState(true)
  const [chatted, setChatted] = useState(false)
  const [roomCollabOk, setRoomCollabOk] = useState(false)
  const [activeOwner, setActiveOwner] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem('ab-onboarded') === '1') {
        onDismiss?.()
        return
      }
      setChatted(Boolean(localStorage.getItem('ab-first-chat')))
      setRoomCollabOk(Boolean(localStorage.getItem('ab-room-collab-seen')))
    } catch {
      setChatted(false)
      setRoomCollabOk(false)
    }
    const onFirstChat = () => setChatted(true)
    const onRoomCollab = () => setRoomCollabOk(true)
    window.addEventListener('ab-first-chat', onFirstChat)
    window.addEventListener('ab-room-collab-seen', onRoomCollab)
    return () => {
      window.removeEventListener('ab-first-chat', onFirstChat)
      window.removeEventListener('ab-room-collab-seen', onRoomCollab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (knownRoomPosts > 0) {
      setChatted(true)
      try {
        localStorage.setItem('ab-first-chat', '1')
      } catch {
        /* ignore */
      }
    }
  }, [knownRoomPosts])

  useEffect(() => {
    let cancelled = false
    const hardStop = window.setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, STATUS_TIMEOUT_MS + 800)

    void (async () => {
      try {
        await ensureSupabaseBrowserConfig()
        let h = await authHeaders()
        // CranL cold boot: session may arrive after public-config — retry once.
        if (!h.Authorization) {
          await new Promise((r) => setTimeout(r, 600))
          if (cancelled) return
          h = await authHeaders()
        }
        const homeQs = scopeId
          ? `?scopeId=${encodeURIComponent(scopeId)}`
          : ''
        const settled = await Promise.allSettled([
          withTimeout(
            fetch('/api/google/calendar?action=status', { headers: h }).then(
              (r) => r.json()
            ),
            STATUS_TIMEOUT_MS
          ),
          withTimeout(
            fetch('/api/google/drive/brain', { headers: h }).then((r) =>
              r.json()
            ),
            STATUS_TIMEOUT_MS
          ),
          withTimeout(
            fetch('/api/settings/providers').then((r) => r.json()),
            STATUS_TIMEOUT_MS
          ),
          withTimeout(
            fetch('/api/integrations/status', { headers: h }).then((r) =>
              r.json()
            ),
            STATUS_TIMEOUT_MS
          ),
          withTimeout(
            fetch(`/api/rooms/home${homeQs}`, { headers: h }).then((r) =>
              r.json()
            ),
            STATUS_TIMEOUT_MS
          ),
        ])
        if (cancelled) return

        const cal =
          settled[0].status === 'fulfilled' ? settled[0].value : null
        const drive =
          settled[1].status === 'fulfilled' ? settled[1].value : null
        const providers =
          settled[2].status === 'fulfilled' ? settled[2].value : null
        const integ =
          settled[3].status === 'fulfilled' ? settled[3].value : null
        const home =
          settled[4].status === 'fulfilled' ? settled[4].value : null

        const nextGoogle =
          Boolean(cal?.connected) || Boolean(integ?.googleAutoLinked)
        const nextDrive = Number(drive?.count || 0)
        const nextKeys = Number(providers?.serviceableCount || 0) > 0
        const nextTelegram =
          Boolean(integ?.telegramConfigured) ||
          Boolean(integ?.telegramOwnerConfigured) ||
          Boolean(integ?.telegramOutboundReady)

        setGoogleOk(nextGoogle)
        setDriveCount(nextDrive)
        setKeysOk(nextKeys)
        setTelegramOk(nextTelegram)

        // Returning users already have room history — don't keep the checklist stuck
        // on localStorage flags that only flip from this browser's future clicks.
        const agendaEventCount = Array.isArray(home?.agenda)
          ? home.agenda.reduce(
              (n: number, day: { events?: unknown[] }) =>
                n + (Array.isArray(day?.events) ? day.events.length : 0),
              0
            )
          : 0
        const hasPosts =
          knownRoomPosts > 0 ||
          (Array.isArray(home?.recentPosts)
            ? home.recentPosts.length > 0
            : false) ||
          (Array.isArray(home?.activity) ? home.activity.length > 0 : false)
        // agenda[] is always two day buckets — count nested events, not bucket length.
        const hasCalendar =
          agendaEventCount > 0 ||
          Number(home?.beyondMonthCount || 0) > 0 ||
          (Array.isArray(home?.calendar?.week) &&
            home.calendar.week.length > 0) ||
          (Array.isArray(home?.calendar?.today) &&
            home.calendar.today.length > 0) ||
          (Array.isArray(home?.calendar?.tomorrow) &&
            home.calendar.tomorrow.length > 0)
        if (hasPosts) {
          setChatted(true)
          try {
            localStorage.setItem('ab-first-chat', '1')
          } catch {
            /* ignore */
          }
        }
        if (hasCalendar) {
          setRoomCollabOk(true)
          try {
            localStorage.setItem('ab-room-collab-seen', '1')
          } catch {
            /* ignore */
          }
        }

        // Active owner / returning user: hide when room is already in use.
        const linked = nextKeys || nextGoogle || nextTelegram || nextDrive > 0
        const roomActive = hasPosts || hasCalendar || knownRoomPosts > 0
        if (roomActive && (linked || (hasPosts && hasCalendar) || knownRoomPosts > 0)) {
          setActiveOwner(true)
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      window.clearTimeout(hardStop)
    }
  }, [knownRoomPosts, scopeId])

  const steps: Step[] = useMemo(
    () => [
      {
        id: 'chat',
        labelAr: 'أرسل أول طلب في الغرفة (بحث أو تلخيص)',
        done: chatted,
        action: () => onNavigate?.('chats'),
        actionLabelAr: 'الغرف',
      },
      {
        id: 'room-calendar',
        labelAr: 'أضف موعداً أو اطلب إحاطة الصباح',
        done: roomCollabOk,
        action: () => {
          try {
            localStorage.setItem('ab-room-collab-seen', '1')
            window.dispatchEvent(new Event('ab-room-collab-seen'))
          } catch {
            /* ignore */
          }
          setRoomCollabOk(true)
          onNavigate?.('calendar')
        },
        actionLabelAr: 'التقويم',
      },
      {
        id: 'drive',
        labelAr: 'ارفع مستنداً للأرشيف (Drive / الملفات)',
        done: driveCount > 0 || keysOk,
        action: () => onNavigate?.('files'),
        actionLabelAr: 'الملفات',
      },
      {
        id: 'google',
        labelAr: 'اربط Google (اختياري — للدعوات وDrive)',
        done: googleOk,
        action: () => onNavigate?.('settings'),
        actionLabelAr: 'الربط',
      },
      {
        id: 'telegram',
        labelAr: 'اربط تيليجرام لأرشفة الجوال (اختياري)',
        done: telegramOk,
        action: () => onNavigate?.('settings'),
        actionLabelAr: 'الربط',
      },
    ],
    [keysOk, googleOk, driveCount, chatted, roomCollabOk, telegramOk, onNavigate]
  )

  const doneCount = steps.filter((s) => s.done).length
  const allCore = steps.slice(0, 2).every((s) => s.done)
  const shouldHide = allCore || activeOwner

  useEffect(() => {
    if (loading || !shouldHide) return
    try {
      localStorage.setItem('ab-onboarded', '1')
    } catch {
      /* ignore */
    }
    onDismiss?.()
    // Only when core/active-owner flips — not on every parent re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, shouldHide])

  if (shouldHide) return null

  return (
    <div
      className={
        className ||
        'rounded-xl border border-ab-accent/25 bg-ab-accent/5 p-3 text-sm'
      }
      dir="rtl"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-semibold text-ab-ink">
            <Sparkles className="h-4 w-4 text-ab-accent" aria-hidden />
            مرحباً بك في Arabic Buzz
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">
            {loading
              ? 'جاري فحص الحالة…'
              : `ثلاث دقائق: أرشيف · غرفة · إحاطة — (${doneCount}/${steps.length})`}
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 text-ab-muted-soft hover:bg-white hover:text-ab-ink"
            aria-label="إخفاء"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {steps.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-2.5 py-1.5"
          >
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ab-ink">
              {s.done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-stone-300" />
              )}
              {s.labelAr}
            </span>
            {!s.done && s.action && (
              <button
                type="button"
                onClick={s.action}
                className="text-[11px] font-medium text-ab-accent"
              >
                {s.actionLabelAr}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
