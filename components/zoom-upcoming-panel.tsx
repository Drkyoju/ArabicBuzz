'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarPlus, RefreshCw, Video } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'
import { formatZoomTopicAr } from '@/lib/zoom/topic-ar'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type Meeting = {
  id: string
  topic: string
  startTime?: string | null
  endTime?: string | null
  joinUrl?: string | null
  hostEmail?: string | null
  source: string
  statusAr: string
}

const TZ = 'Asia/Riyadh'

function fmtWhen(iso?: string | null) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      timeZone: TZ,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/**
 * Upcoming Zoom meetings for the shared team calendar (all accounts).
 * Shown under تقويم الفريق → Zoom والاجتماعات.
 */
export function ZoomUpcomingPanel({
  scopeId = PRIMARY_TEAM_SCOPE_ID,
}: {
  scopeId?: string
}) {
  const signedIn = useSignedIn()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [msg, setMsg] = useState('')
  const [configured, setConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/zoom/upcoming?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        configured?: boolean
        meetings?: Meeting[]
        messageAr?: string
        code?: string
        error?: string
      }
      if (!res.ok) {
        setMeetings([])
        setMsg(
          res.status === 401 || data.code === 'AUTH_REQUIRED'
            ? 'سجّل الدخول لعرض مواعيد Zoom.'
            : data.messageAr || data.error || 'تعذّر جلب مواعيد Zoom'
        )
        return
      }
      setConfigured(Boolean(data.configured))
      setMeetings(data.meetings || [])
      setMsg(data.messageAr || '')
    } catch {
      setMsg('تعذّر جلب مواعيد Zoom')
      setMeetings([])
    } finally {
      setBusy(false)
    }
  }, [scopeId])

  useEffect(() => {
    if (signedIn === null) return
    if (signedIn === false) {
      setBusy(false)
      setMeetings([])
      setMsg('سجّل الدخول لعرض مواعيد Zoom القادمة.')
      return
    }
    void load()
  }, [load, signedIn])

  async function syncToTeam(meetingId?: string) {
    if (signedIn !== true || syncBusy) return
    setSyncBusy(true)
    try {
      const res = await fetch('/api/zoom/sync-to-team', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scopeId, meetingId }),
      })
      const data = (await res.json()) as { messageAr?: string }
      setMsg(data.messageAr || (res.ok ? 'تمت المزامنة' : 'تعذّرت المزامنة'))
      if (res.ok) {
        try {
          window.dispatchEvent(new CustomEvent('ab-room-calendar-changed'))
        } catch {
          /* ignore */
        }
        void load()
      }
    } catch {
      setMsg('تعذّرت إضافة Zoom إلى تقويم الفريق')
    } finally {
      setSyncBusy(false)
    }
  }

  const zoomOnly = meetings.filter((m) => m.source === 'zoom_api')

  return (
    <section
      className="rounded-xl border border-ab-border bg-ab-surface p-4"
      dir="rtl"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-ab-ink">
            <Video className="h-4 w-4 text-ab-accent" aria-hidden />
            Zoom — الاجتماعات القادمة
          </h3>
          <p className="mt-1 text-[11px] text-stone-500">
            من تقويم الفريق المشترك
            {configured ? ' وحساب Zoom' : ''} — يظهر لكل الحسابات في الغرفة.
            المزامنة باتجاه واحد: Zoom → تقويم الفريق (إنشاء موعد من Zoom عند
            الحجز يعمل بالعكس).
          </p>
          {msg && (
            <p className="mt-1 text-[11px] text-stone-500">{msg}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            disabled={busy || signedIn !== true}
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[11px] disabled:opacity-40"
          >
            <RefreshCw
              className={cn('h-3 w-3', busy && 'animate-spin')}
              aria-hidden
            />
            تحديث
          </button>
          {configured && zoomOnly.length > 0 && (
            <button
              type="button"
              disabled={syncBusy || signedIn !== true}
              onClick={() => void syncToTeam()}
              className="inline-flex items-center gap-1 rounded-md border border-ab-accent/40 bg-ab-accent/5 px-2 py-1 text-[11px] font-medium text-ab-accent disabled:opacity-40"
            >
              <CalendarPlus className="h-3 w-3" aria-hidden />
              {syncBusy ? 'جاري…' : 'أضف للكل'}
            </button>
          )}
        </div>
      </div>

      {signedIn !== true ? (
        <p className="text-sm text-stone-500">
          <Link
            href="/auth/login"
            className="font-semibold text-ab-accent underline"
          >
            سجّل الدخول
          </Link>{' '}
          لرؤية مواعيد Zoom.
        </p>
      ) : meetings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ab-border bg-stone-50/70 px-3 py-4 text-center text-[12px] text-stone-500">
          لا اجتماعات Zoom قادمة. أضف موعداً في «أسبوع / قائمة» مع رابط Zoom، أو
          أنشئ اجتماعاً من تبويب تقويم Google (للمالك).
        </p>
      ) : (
        <ul className="space-y-2">
          {meetings.map((m) => (
            <li
              key={`${m.source}-${m.id}-${m.startTime || ''}`}
              className="rounded-lg border border-ab-border bg-white px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ab-ink">
                    {formatZoomTopicAr(m.topic)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    {fmtWhen(m.startTime)}
                    {m.statusAr ? ` · ${m.statusAr}` : ''}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">
                  {m.source === 'zoom_api' ? 'Zoom' : 'فريق'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {m.joinUrl && (
                  <a
                    href={m.joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="inline-block text-[11px] text-ab-accent underline"
                  >
                    انضم / الرابط
                  </a>
                )}
                {m.source === 'zoom_api' && (
                  <button
                    type="button"
                    disabled={syncBusy}
                    onClick={() => void syncToTeam(m.id)}
                    className="text-[11px] font-medium text-ab-accent underline disabled:opacity-40"
                  >
                    أضف لتقويم الفريق
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
