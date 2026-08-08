'use client'

import { useMemo } from 'react'
import { Bot, Clock } from 'lucide-react'
import type { AssistantJob } from '@/lib/assistants/types'
import { defaultSeatNameAr } from '@/lib/rooms/agent-names'
import { cn } from '@/lib/utils'

export type OpsSeatStatus = 'working' | 'ready' | 'off'

export type OpsSeatView = {
  index: number
  nameAr: string
  status: OpsSeatStatus
  statusAr: string
  jobTitleAr?: string
  etaAr?: string
  progressPct?: number | null
}

function formatEtaLeftAr(
  etaSeconds: number,
  startedAt: string | null | undefined
): string {
  if (!etaSeconds || etaSeconds <= 0) return 'يعمل…'
  if (!startedAt) return `≈ ${etaSeconds} ث`
  const elapsed = Math.max(0, Date.now() - Date.parse(startedAt))
  if (!Number.isFinite(elapsed)) return `≈ ${etaSeconds} ث`
  const left = Math.max(5, etaSeconds - Math.round(elapsed / 1000))
  if (left < 60) return `≈ ${left} ث متبقية`
  const m = Math.floor(left / 60)
  const s = left % 60
  return s ? `≈ ${m} د ${s} ث` : `≈ ${m} د متبقية`
}

function progressFromEta(
  etaSeconds: number,
  startedAt: string | null | undefined
): number | null {
  if (!etaSeconds || etaSeconds <= 0 || !startedAt) return null
  const elapsed = Math.max(0, Date.now() - Date.parse(startedAt))
  if (!Number.isFinite(elapsed)) return null
  return Math.min(95, Math.round((elapsed / (etaSeconds * 1000)) * 100))
}

/** Map parallel worker pool + jobs → seat strip for مهام التشغيل. */
export function buildOpsSeats(opts: {
  maxParallel: number
  jobs: AssistantJob[]
  poolOnline?: boolean
}): OpsSeatView[] {
  const max = Math.max(1, Math.min(20, Math.floor(opts.maxParallel) || 1))
  const running = opts.jobs.filter((j) => j.status === 'running')
  const online = opts.poolOnline !== false

  return Array.from({ length: max }, (_, i) => {
    const job = running[i]
    const nameAr = defaultSeatNameAr(i + 1)
    if (!online) {
      return {
        index: i + 1,
        nameAr,
        status: 'off' as const,
        statusAr: 'طافي',
      }
    }
    if (job) {
      return {
        index: i + 1,
        nameAr,
        status: 'working' as const,
        statusAr: 'يعمل',
        jobTitleAr: job.assistantNameAr || job.message.slice(0, 48),
        etaAr: formatEtaLeftAr(job.etaSeconds, job.startedAt),
        progressPct: progressFromEta(job.etaSeconds, job.startedAt),
      }
    }
    return {
      index: i + 1,
      nameAr,
      status: 'ready' as const,
      statusAr: 'جاهز',
    }
  })
}

export function AssistantsOpsSeatsStrip({
  maxParallel,
  maxPerUser,
  jobs,
  poolOnline = true,
  className,
}: {
  maxParallel: number
  maxPerUser?: number
  jobs: AssistantJob[]
  /** False when signed out / queue unavailable. */
  poolOnline?: boolean
  className?: string
}) {
  const seats = useMemo(
    () => buildOpsSeats({ maxParallel, jobs, poolOnline }),
    [maxParallel, jobs, poolOnline]
  )
  const working = seats.filter((s) => s.status === 'working')
  const waiting = jobs.filter((j) => j.status === 'waiting').length
  const drainCap = Math.min(maxPerUser ?? maxParallel, maxParallel)

  return (
    <div
      className={cn(
        'rounded-lg border border-ab-border bg-ab-surface/80 px-2.5 py-2 shadow-sm',
        className
      )}
      dir="rtl"
      aria-label="حالة مقاعد التشغيل"
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[12px] font-bold text-ab-ink">
            <Bot className="h-3.5 w-3.5 text-ab-accent" aria-hidden />
            عمال التشغيل
          </span>
          <span
            className="inline-flex items-center rounded-md border border-ab-accent/30 bg-ab-accent/10 px-1.5 py-px text-[10px] font-bold text-ab-accent"
            title="الحد الأقصى للمهام المتوازية في المساحة"
          >
            حدّ متوازٍ: {maxParallel}
            {maxPerUser != null && maxPerUser !== maxParallel
              ? ` · لكل موظف ${maxPerUser}`
              : ''}
          </span>
          <span className="text-[10px] text-stone-500">
            يعمل الآن: {working.length}/{drainCap}
            {waiting > 0 ? ` · انتظار ${waiting}` : ''}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-stone-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-ab-accent" /> يعمل
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> جاهز
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-stone-400" /> طافي
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 sm:grid-cols-8">
        {seats.map((seat) => (
          <div
            key={seat.index}
            title={
              seat.status === 'working'
                ? `${seat.nameAr}: ${seat.jobTitleAr || 'مهمة'} · ${seat.etaAr || 'يعمل…'}`
                : `${seat.nameAr}: ${seat.statusAr}`
            }
            className={cn(
              'min-w-0 rounded-md border px-1.5 py-1 text-start',
              seat.status === 'working' &&
                'border-ab-accent/40 bg-ab-accent/10 ring-1 ring-ab-accent/20',
              seat.status === 'ready' &&
                'border-emerald-100 bg-emerald-50/60',
              seat.status === 'off' && 'border-stone-200 bg-stone-50 opacity-70'
            )}
          >
            <div className="flex items-center justify-between gap-0.5">
              <span className="truncate text-[10px] font-semibold text-ab-ink">
                {seat.nameAr}
              </span>
              <span
                className={cn(
                  'shrink-0 text-[8px] font-bold',
                  seat.status === 'working' && 'text-ab-accent',
                  seat.status === 'ready' && 'text-emerald-700',
                  seat.status === 'off' && 'text-ab-muted-soft'
                )}
              >
                {seat.statusAr}
              </span>
            </div>
            {seat.status === 'working' ? (
              <>
                <p className="mt-0.5 truncate text-[9px] text-stone-600">
                  {seat.jobTitleAr}
                </p>
                <p className="mt-0.5 flex items-center gap-0.5 text-[8px] text-ab-accent">
                  <Clock className="h-2 w-2" aria-hidden />
                  {seat.etaAr || 'يعمل…'}
                </p>
                {seat.progressPct != null ? (
                  <div
                    className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-ab-accent/15"
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full bg-ab-accent transition-[width] duration-500"
                      style={{ width: `${seat.progressPct}%` }}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-0.5 truncate text-[9px] text-ab-muted-soft">
                {seat.status === 'ready' ? 'فارغ' : 'غير متصل'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
