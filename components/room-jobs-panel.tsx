'use client'

import { useCallback, useEffect, useState } from 'react'
import { Clock, Loader2 } from 'lucide-react'
import type { AssistantJob } from '@/lib/assistants/types'
import { authHeaders } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'

const POLL_MS = 12_000

const STATUS_AR: Record<string, string> = {
  waiting: 'بالانتظار',
  running: 'قيد التشغيل',
  done: 'اكتمل',
  failed: 'فشل',
  cancelled: 'أُلغي',
}

/**
 * Compact room-scoped job strip — assistant queue + link to cron logs.
 */
export function RoomJobsPanel({
  scopeId,
  className,
}: {
  scopeId: string
  className?: string
}) {
  const [jobs, setJobs] = useState<AssistantJob[]>([])
  const [counts, setCounts] = useState({
    waiting: 0,
    running: 0,
    done: 0,
    failed: 0,
  })
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/assistants/queue?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        jobs?: AssistantJob[]
        counts?: typeof counts
      }
      setJobs(data.jobs || [])
      setCounts(
        data.counts || {
          waiting: 0,
          running: 0,
          done: 0,
          failed: 0,
        }
      )
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذّر تحميل المهام')
    }
  }, [scopeId])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  const active = jobs.filter(
    (j) => j.status === 'waiting' || j.status === 'running'
  )
  const recent = jobs
    .filter((j) => j.status === 'done' || j.status === 'failed')
    .slice(0, 3)

  if (!active.length && !recent.length && !err) return null

  return (
    <section
      className={cn(
        'rounded-lg border border-ab-border bg-ab-surface/90 px-2.5 py-2 text-[11px]',
        className
      )}
      dir="rtl"
      aria-label="مهام الغرفة الخلفية"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-ab-accent" aria-hidden />
        <span className="font-semibold text-ab-ink">مهام خلفية</span>
        <span className="text-ab-muted-soft">
          انتظار {counts.waiting} · تشغيل {counts.running}
        </span>
      </div>
      {err ? (
        <p className="text-amber-800">{err}</p>
      ) : (
        <ul className="space-y-1">
          {active.map((j) => (
            <li
              key={j.id}
              className="flex items-start gap-1.5 rounded-md bg-white/80 px-2 py-1"
            >
              {j.status === 'running' ? (
                <Loader2
                  className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-ab-accent"
                  aria-hidden
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ab-ink">
                  {j.assistantNameAr || 'مساعد'}
                </p>
                <p className="truncate text-ab-muted-soft">
                  {j.message.slice(0, 72)}
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-ab-accent">
                {STATUS_AR[j.status] || j.status}
              </span>
            </li>
          ))}
          {recent.map((j) => (
            <li
              key={j.id}
              className="truncate px-2 text-[10px] text-ab-muted-soft"
            >
              {STATUS_AR[j.status]} — {j.message.slice(0, 48)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
