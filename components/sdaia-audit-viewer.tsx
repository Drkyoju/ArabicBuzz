'use client'

import { useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'

type AuditRow = {
  id: string
  timestamp: string
  riskTier: string
  dataLocality: string
  watermarkSignature: string
  scopeId?: string
  modelUsed?: string
  approvedBy?: string | null
}

const RISK_LABEL: Record<string, string> = {
  TIER_1_LOW: 'منخفض',
  TIER_2_MEDIUM: 'متوسط',
  TIER_3_HIGH: 'مرتفع',
  TIER_4_CRITICAL: 'حرج',
}

function riskBadgeClass(tier: string) {
  if (tier.includes('CRITICAL') || tier.includes('4'))
    return 'bg-red-100 text-red-800'
  if (tier.includes('HIGH') || tier.includes('3'))
    return 'bg-amber-100 text-amber-900'
  if (tier.includes('MEDIUM') || tier.includes('2'))
    return 'bg-yellow-50 text-yellow-900'
  return 'bg-emerald-50 text-emerald-800'
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso)
    const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d)
    const time = new Intl.DateTimeFormat('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
    return { hijri, time, full: iso }
  } catch {
    return { hijri: iso, time: '', full: iso }
  }
}

export function SdaiaAuditViewer() {
  const signedIn = useSignedIn()
  const [logs, setLogs] = useState<AuditRow[]>([])
  const [scopeId, setScopeId] = useState('')
  const [risk, setRisk] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    setErr('')
    setBusy(true)
    try {
      const qs = new URLSearchParams()
      if (scopeId.trim()) qs.set('scopeId', scopeId.trim())
      if (from) qs.set('from', new Date(from).toISOString())
      if (to) {
        const end = new Date(to)
        end.setHours(23, 59, 59, 999)
        qs.set('to', end.toISOString())
      }
      const res = await fetch(`/api/audit/export?${qs.toString()}`, {
        headers: await authHeaders(),
      })
      if (!res.ok) {
        setLogs([])
        setErr(
          signedIn === false
            ? 'سجّل الدخول لعرض سجل التدقيق الحقيقي.'
            : 'تعذّر تحميل السجل — تحقق من الصلاحيات أو أعد المحاولة.'
        )
        return
      }
      const data = await res.json()
      setLogs(data.logs || [])
    } finally {
      setBusy(false)
      setLoaded(true)
    }
  }

  useEffect(() => {
    if (signedIn === null) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn])

  const filtered = useMemo(
    () => logs.filter((l) => !risk || l.riskTier === risk),
    [logs, risk]
  )

  function exportCsv() {
    const qs = new URLSearchParams({ format: 'csv' })
    if (scopeId.trim()) qs.set('scopeId', scopeId.trim())
    if (from) qs.set('from', new Date(from).toISOString())
    if (to) {
      const end = new Date(to)
      end.setHours(23, 59, 59, 999)
      qs.set('to', end.toISOString())
    }
    void authHeaders().then((h) =>
      fetch(`/api/audit/export?${qs.toString()}`, { headers: h }).then(
        async (res) => {
          if (!res.ok) {
            setErr('تعذّر التصدير — سجّل الدخول أولاً.')
            return
          }
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'audit-export.csv'
          a.click()
          URL.revokeObjectURL(url)
        }
      )
    )
  }

  if (signedIn === false) {
    return (
      <section className="border-t border-ab-border px-4 py-8" dir="rtl">
        <h2 className="text-xl font-bold">سجل التدقيق</h2>
        <div className="mt-4 rounded-xl border border-dashed border-ab-border bg-stone-50 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-ab-ink">
            يلزم تسجيل الدخول لعرض سجل التدقيق
          </p>
          <p className="mt-1 text-xs text-stone-500">
            يظهر هنا ختم الإجراءات الحساسة بعد تنفيذ الوكلاء — للجلسة الحقيقية
            فقط، وليس معاينة الزائر.
          </p>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('ab-nav', { detail: 'settings' })
              )
            }
            className="mt-4 rounded-md bg-ab-accent px-3 py-2 text-xs font-semibold text-white"
          >
            سجّل الدخول
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="border-t border-ab-border px-4 py-8" dir="rtl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">سجل التدقيق</h2>
          <p className="mt-0.5 text-[11px] text-stone-500">
            خط زمني لإجراءات الوكلاء مع تصنيف الخطر وختم المحلية.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="rounded-md bg-ab-ink px-3 py-2 text-sm text-white"
        >
          تصدير CSV
        </button>
      </div>
      {err && <p className="mb-3 text-xs text-amber-800">{err}</p>}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-stone-500">
          النطاق
          <input
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            placeholder="shared-demo"
            className="rounded-md border border-ab-border px-3 py-2 text-sm"
            dir="ltr"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-stone-500">
          من
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-ab-border px-3 py-2 text-sm"
            dir="ltr"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-stone-500">
          إلى
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-ab-border px-3 py-2 text-sm"
            dir="ltr"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-stone-500">
          الخطر
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="rounded-md border border-ab-border px-3 py-2 text-sm"
          >
            <option value="">كل التصنيفات</option>
            <option value="TIER_1_LOW">منخفض (١)</option>
            <option value="TIER_2_MEDIUM">متوسط (٢)</option>
            <option value="TIER_3_HIGH">مرتفع (٣)</option>
            <option value="TIER_4_CRITICAL">حرج (٤)</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="rounded-md border border-ab-border bg-white px-3 py-2 text-sm disabled:opacity-50"
        >
          {busy ? 'جاري التحديث…' : 'تحديث'}
        </button>
      </div>

      {filtered.length === 0 && loaded && !err ? (
        <div className="rounded-xl border border-dashed border-ab-border bg-stone-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-stone-600">لا سجلات بعد</p>
          <p className="mt-1 text-xs text-stone-500">
            ستظهر هنا بعد تنفيذ الوكلاء لإجراءات تُسجَّل في التدقيق. جرّب توسيع
            نطاق التاريخ أو إزالة التصفية.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-0 border-s-2 border-ab-border ps-4">
          {filtered.map((l) => {
            const when = formatWhen(l.timestamp)
            return (
              <li key={l.id} className="relative pb-5 last:pb-0">
                <span
                  className="absolute -start-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-ab-accent"
                  aria-hidden
                />
                <div className="rounded-lg border border-ab-border bg-white px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-ab-ink">
                        {when.hijri}
                        {when.time ? (
                          <span className="ms-2 text-[11px] font-normal text-stone-500">
                            {when.time}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[10px] text-stone-400" dir="ltr">
                        {when.full}
                      </p>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${riskBadgeClass(l.riskTier)}`}
                    >
                      {RISK_LABEL[l.riskTier] || l.riskTier}
                    </span>
                  </div>
                  <dl className="mt-2 grid gap-1 text-[11px] text-stone-600 sm:grid-cols-2">
                    <div>
                      <dt className="inline text-stone-400">النطاق · </dt>
                      <dd className="inline font-mono" dir="ltr">
                        {l.scopeId || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-stone-400">المحلية · </dt>
                      <dd className="inline">{l.dataLocality || '—'}</dd>
                    </div>
                    {l.modelUsed ? (
                      <div>
                        <dt className="inline text-stone-400">النموذج · </dt>
                        <dd className="inline font-mono" dir="ltr">
                          {l.modelUsed}
                        </dd>
                      </div>
                    ) : null}
                    {l.approvedBy ? (
                      <div>
                        <dt className="inline text-stone-400">المعتمد · </dt>
                        <dd className="inline font-mono" dir="ltr">
                          {l.approvedBy}
                        </dd>
                      </div>
                    ) : null}
                    <div className="sm:col-span-2">
                      <dt className="inline text-stone-400">الختم · </dt>
                      <dd className="inline font-mono text-[10px]" dir="ltr">
                        {l.watermarkSignature?.slice(0, 32)}…
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
