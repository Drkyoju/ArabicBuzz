'use client'

import { useEffect, useMemo, useState } from 'react'
import { History, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ActivityFeedItem = {
  id: string
  actorAr: string
  actionAr: string
  detailAr?: string | null
  atAr: string
  /** ISO or epoch ms — used for period filters */
  atMs: number
  badge?: 'الآن' | 'رسالة' | null
}

type Period = 'today' | 'week' | 'month' | 'all'

const PERIODS: Array<{ id: Period; labelAr: string }> = [
  { id: 'today', labelAr: 'اليوم' },
  { id: 'week', labelAr: 'الأسبوع' },
  { id: 'month', labelAr: 'الشهر' },
  { id: 'all', labelAr: 'الكل' },
]

const TZ = 'Asia/Riyadh'

function riyadhDayStartMs(offsetDays = 0): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const base = new Date(Date.now() + offsetDays * 86400_000)
  const ymd = fmt.format(base)
  return new Date(`${ymd}T00:00:00+03:00`).getTime()
}

function periodCutoffMs(period: Period): number | null {
  if (period === 'all') return null
  if (period === 'today') return riyadhDayStartMs(0)
  if (period === 'week') return riyadhDayStartMs(0) - 6 * 86400_000
  return riyadhDayStartMs(0) - 29 * 86400_000
}

/**
 * نافذة سجل النشاط — فلاتر زمنية خارج لوحة اليوم المضغوطة.
 */
export function ActivityHistoryDialog({
  open,
  onClose,
  items,
}: {
  open: boolean
  onClose: () => void
  items: ActivityFeedItem[]
}) {
  const [period, setPeriod] = useState<Period>('all')

  useEffect(() => {
    if (!open) return
    setPeriod('all')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const cut = periodCutoffMs(period)
    const list =
      cut == null
        ? items
        : items.filter((i) => i.atMs > 0 && i.atMs >= cut)
    return [...list].sort((a, b) => b.atMs - a.atMs)
  }, [items, period])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="كل النشاط"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative z-[71] flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ab-border bg-ab-surface shadow-xl sm:max-h-[90dvh]">
        <div className="flex items-center justify-between border-b border-ab-border px-4 py-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
              <History className="h-4 w-4 text-ab-accent" aria-hidden />
              كل النشاط
            </h3>
            <p className="text-[10px] text-stone-400">
              تصفّح نشاط اليوم والأسبوع والشهر دون ازدحام اللوحة
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ab-border p-1.5 hover:bg-stone-50"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-ab-border px-4 py-2.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                period === p.id
                  ? 'bg-ab-accent text-white'
                  : 'border border-ab-border bg-white text-stone-700 hover:bg-stone-50'
              )}
            >
              {p.labelAr}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-stone-400">
              لا نشاط في هذه الفترة
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-ab-border/70 bg-white px-2.5 py-2 text-[12px] leading-snug text-stone-600"
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
                  <span className="font-semibold text-ab-ink">{a.actorAr}</span>
                  {' · '}
                  {a.actionAr}
                  {a.detailAr ? (
                    <span className="text-stone-400"> — {a.detailAr}</span>
                  ) : null}
                  {a.atAr ? (
                    <span className="text-stone-400"> · {a.atAr}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-ab-border px-4 py-2.5 text-[10px] text-stone-400">
          {filtered.length} من أصل {items.length} نشاط
        </div>
      </div>
    </div>
  )
}
