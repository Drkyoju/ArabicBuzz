'use client'

import { useCallback, useEffect, useState } from 'react'
import { Radio, RefreshCw, Video } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { cn } from '@/lib/utils'

type Meeting = {
  id: string
  topic: string
  joinUrl?: string | null
  hostEmail?: string | null
  startTime?: string | null
  participants?: number | null
  source: string
  live: boolean
  statusAr: string
}

/**
 * Shows whether Zoom sessions are live right now (API + room calendar).
 */
export function ZoomLivePanel({ compact }: { compact?: boolean }) {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const signedIn = useSignedIn()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [liveCount, setLiveCount] = useState(0)
  const [msg, setMsg] = useState('')
  const [configured, setConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/zoom/live?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        configured?: boolean
        liveCount?: number
        meetings?: Meeting[]
        messageAr?: string
        checkedAt?: string
        warning?: string
        code?: string
      }
      if (!res.ok) {
        setMeetings([])
        setLiveCount(0)
        setCheckedAt(null)
        setMsg(
          res.status === 401 || data.code === 'AUTH_REQUIRED'
            ? 'سجّل الدخول لعرض جلسات Zoom.'
            : data.messageAr || 'تعذّر فحص جلسات Zoom'
        )
        return
      }
      setConfigured(Boolean(data.configured))
      setLiveCount(Number(data.liveCount || 0))
      setMeetings(data.meetings || [])
      setMsg(data.messageAr || '')
      setCheckedAt(data.checkedAt || null)
    } catch {
      setMsg('تعذّر فحص جلسات Zoom')
    } finally {
      setBusy(false)
    }
  }, [scopeId])

  useEffect(() => {
    if (signedIn === null) return
    if (signedIn === false) {
      setBusy(false)
      setMeetings([])
      setLiveCount(0)
      setMsg('سجّل الدخول لعرض جلسات Zoom.')
      return
    }
    void load()
    const id = window.setInterval(() => void load(), 45_000)
    return () => window.clearInterval(id)
  }, [load, signedIn])

  if (compact) {
    if (signedIn !== true) return null
    return (
      <button
        type="button"
        onClick={() => void load()}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]',
          liveCount > 0
            ? 'bg-red-50 font-semibold text-red-700'
            : 'text-stone-500 hover:bg-stone-50'
        )}
        title={msg}
      >
        <span
          className={cn(
            'inline-block h-1.5 w-1.5 rounded-full',
            liveCount > 0 ? 'animate-pulse bg-red-600' : 'bg-stone-300'
          )}
          aria-hidden
        />
        {liveCount > 0
          ? `Zoom مباشر (${liveCount})`
          : configured
            ? 'Zoom: لا بث الآن'
            : 'Zoom غير مربوط'}
      </button>
    )
  }

  return (
    <section
      className="rounded-xl border border-ab-border bg-ab-surface p-4"
      dir="rtl"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-ab-ink">
            <Video className="h-4 w-4 text-ab-accent" aria-hidden />
            جلسات Zoom الآن
            {liveCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                <Radio className="h-3 w-3 animate-pulse" aria-hidden />
                مباشر {liveCount}
              </span>
            )}
          </h3>
          <p className="mt-1 text-[11px] text-stone-500">
            {msg ||
              (configured
                ? 'يُفحص الحساب كل دقيقة تقريباً.'
                : 'اربط Zoom من الإعدادات لمعرفة البث المباشر.')}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[11px] disabled:opacity-40"
        >
          <RefreshCw
            className={cn('h-3 w-3', busy && 'animate-spin')}
            aria-hidden
          />
          تحديث
        </button>
      </div>

      {meetings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ab-border px-3 py-6 text-center text-xs text-stone-400">
          لا جلسات Zoom ظاهرة الآن.
        </p>
      ) : (
        <ul className="space-y-2">
          {meetings.map((m) => (
            <li
              key={`${m.source}-${m.id}`}
              className={cn(
                'rounded-lg border px-3 py-2',
                m.live
                  ? 'border-red-200 bg-red-50/60'
                  : 'border-ab-border bg-white'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ab-ink">
                    {m.topic}
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    {m.statusAr}
                    {m.hostEmail ? ` · ${m.hostEmail}` : ''}
                    {typeof m.participants === 'number'
                      ? ` · ${m.participants} مشارك`
                      : ''}
                  </p>
                </div>
                {m.live && (
                  <span className="shrink-0 text-[10px] font-bold text-red-700">
                    LIVE
                  </span>
                )}
              </div>
              {m.joinUrl && (
                <a
                  href={m.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="mt-1 inline-block text-[11px] text-ab-accent underline"
                >
                  انضم للاجتماع
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {checkedAt && (
        <p className="mt-2 text-[10px] text-stone-400" dir="ltr">
          آخر فحص: {new Date(checkedAt).toLocaleTimeString('ar-SA')}
        </p>
      )}
    </section>
  )
}
