'use client'

import { useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/supabase/browser'

type AuditRow = {
  id: string
  timestamp: string
  riskTier: string
  dataLocality: string
  watermarkSignature: string
  scopeId?: string
}

export function SdaiaAuditViewer() {
  const [logs, setLogs] = useState<AuditRow[]>([])
  const [scopeId, setScopeId] = useState('')
  const [risk, setRisk] = useState('')
  const [err, setErr] = useState('')

  async function load() {
    setErr('')
    const qs = new URLSearchParams()
    if (scopeId) qs.set('scopeId', scopeId)
    const res = await fetch(`/api/audit/export?${qs.toString()}`, {
      headers: await authHeaders(),
    })
    if (!res.ok) {
      setLogs([])
      setErr('سجّل الدخول لعرض سجل التدقيق الحقيقي.')
      return
    }
    const data = await res.json()
    setLogs(data.logs || [])
  }

  useEffect(() => {
    void load()
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(
    () => logs.filter((l) => !risk || l.riskTier === risk),
    [logs, risk]
  )

  function exportCsv() {
    const qs = new URLSearchParams({ format: 'csv' })
    if (scopeId) qs.set('scopeId', scopeId)
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
          a.download = 'sdaia-audit.csv'
          a.click()
          URL.revokeObjectURL(url)
        }
      )
    )
  }

  return (
    <section className="border-t border-ab-border px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">سجل تدقيق SDAIA</h2>
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="rounded-md bg-ab-ink px-3 py-2 text-sm text-white"
        >
          تصدير التقرير التنظيمي (CSV)
        </button>
      </div>
      {err && (
        <p className="mb-3 text-xs text-amber-800">{err}</p>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={scopeId}
          onChange={(e) => setScopeId(e.target.value)}
          placeholder="تصفية بالنطاق"
          className="rounded-md border border-ab-border px-3 py-2 text-sm"
        />
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
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
        >
          تحديث
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-ab-border">
        <table className="w-full min-w-[40rem] text-right text-sm" dir="rtl">
          <thead className="bg-stone-50 text-[11px] text-stone-500">
            <tr>
              <th className="px-3 py-2 font-medium">الوقت</th>
              <th className="px-3 py-2 font-medium">النطاق</th>
              <th className="px-3 py-2 font-medium">الخطر</th>
              <th className="px-3 py-2 font-medium">المحلية</th>
              <th className="px-3 py-2 font-medium">الختم</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-stone-400">
                  لا سجلات بعد — ستظهر هنا بعد تنفيذ الوكلاء لإجراءات.
                </td>
              </tr>
            ) : (
              filtered.map((l) => (
                <tr key={l.id} className="border-t border-ab-border">
                  <td className="px-3 py-2 text-[11px] text-stone-600" dir="ltr">
                    {l.timestamp}
                  </td>
                  <td className="px-3 py-2">{l.scopeId || '—'}</td>
                  <td className="px-3 py-2 text-[11px]">{l.riskTier}</td>
                  <td className="px-3 py-2 text-[11px]">{l.dataLocality}</td>
                  <td className="px-3 py-2 font-mono text-[10px]" dir="ltr">
                    {l.watermarkSignature?.slice(0, 24)}…
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
