'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

type AgentRow = {
  agentId: string
  agentNameAr: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  runs: number
}

type DayRow = {
  dayKey: string
  totalTokens: number
  runs: number
}

function fmt(n: number) {
  return new Intl.NumberFormat('ar-SA').format(n || 0)
}

export function TokenUsagePanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [byAgent, setByAgent] = useState<AgentRow[]>([])
  const [byDay, setByDay] = useState<DayRow[]>([])
  const [totals, setTotals] = useState({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    runs: 0,
  })
  const [days, setDays] = useState(14)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setHint('')
    try {
      const res = await fetch(
        `/api/usage?days=${days}&scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        error?: string
        hintAr?: string
        byAgent?: AgentRow[]
        byDay?: DayRow[]
        totals?: typeof totals
      }
      if (res.status === 403) {
        setError('هذه اللوحة للمالك فقط.')
        return
      }
      if (!res.ok && data.error) {
        setError(data.error)
        return
      }
      if (data.error) setHint(data.hintAr || data.error)
      setByAgent(data.byAgent || [])
      setByDay(data.byDay || [])
      if (data.totals) setTotals(data.totals)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر التحميل')
    } finally {
      setLoading(false)
    }
  }, [days, scopeId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="ab-page-narrow" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="ab-title">استهلاك الرموز</h2>
          <p className="ab-subtitle">
            لكل وكيل ولكل يوم (توقيت السعودية) — مرئي للمالك فقط
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            className="ab-input !w-auto !py-1 text-[12px]"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 14)}
            aria-label="عدد الأيام"
          >
            <option value={7}>٧ أيام</option>
            <option value={14}>١٤ يوماً</option>
            <option value={30}>٣٠ يوماً</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="ab-btn-secondary"
            disabled={loading}
          >
            <RefreshCw className="h-3 w-3" />
            تحديث
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      ) : null}
      {hint && !error ? (
        <p className="mt-3 rounded-md border border-ab-border bg-ab-surface px-3 py-2 text-xs text-ab-muted">
          {hint}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-ab-border bg-ab-surface px-3 py-2.5">
          <p className="text-[11px] text-ab-muted">إجمالي الرموز</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-ab-ink" dir="ltr">
            {fmt(totals.totalTokens)}
          </p>
        </div>
        <div className="rounded-lg border border-ab-border bg-ab-surface px-3 py-2.5">
          <p className="text-[11px] text-ab-muted">إدخال / إخراج</p>
          <p className="mt-0.5 text-sm font-medium tabular-nums text-ab-ink" dir="ltr">
            {fmt(totals.inputTokens)} / {fmt(totals.outputTokens)}
          </p>
        </div>
        <div className="rounded-lg border border-ab-border bg-ab-surface px-3 py-2.5">
          <p className="text-[11px] text-ab-muted">تشغيلات</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-ab-ink" dir="ltr">
            {fmt(totals.runs)}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ab-ink">
          <Activity className="h-3.5 w-3.5 text-ab-accent" aria-hidden />
          حسب الوكيل
        </h3>
        {loading && byAgent.length === 0 ? (
          <p className="mt-2 text-sm text-ab-muted">جاري التحميل…</p>
        ) : byAgent.length === 0 ? (
          <p className="mt-2 text-sm text-ab-muted">
            لا بيانات بعد — ستظهر بعد تشغيل الوكلاء.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {byAgent.map((a) => (
              <li
                key={a.agentId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ab-border bg-ab-surface px-3 py-2"
              >
                <span className="text-sm font-medium text-ab-ink">
                  {a.agentNameAr}
                </span>
                <span className="text-[12px] tabular-nums text-ab-muted" dir="ltr">
                  {fmt(a.totalTokens)} · {fmt(a.runs)} runs
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-ab-ink">حسب اليوم</h3>
        {byDay.length === 0 ? (
          <p className="mt-2 text-sm text-ab-muted">—</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {byDay.map((d) => (
              <li
                key={d.dayKey}
                className="flex items-center justify-between gap-2 rounded-lg border border-ab-border/70 px-3 py-1.5 text-[13px]"
              >
                <span className="font-mono text-ab-ink" dir="ltr">
                  {d.dayKey}
                </span>
                <span className="tabular-nums text-ab-muted" dir="ltr">
                  {fmt(d.totalTokens)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
