'use client'

import { useEffect, useMemo, useState } from 'react'

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

  async function load() {
    const secret =
      process.env.NEXT_PUBLIC_AUDIT_EXPORT_SECRET ||
      process.env.NEXT_PUBLIC_CRON_SECRET ||
      'change-me'
    const qs = new URLSearchParams()
    if (scopeId) qs.set('scopeId', scopeId)
    const res = await fetch(`/api/audit/export?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    if (!res.ok) {
      setLogs([])
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
    const secret =
      process.env.NEXT_PUBLIC_AUDIT_EXPORT_SECRET ||
      process.env.NEXT_PUBLIC_CRON_SECRET ||
      'change-me'
    const qs = new URLSearchParams({ format: 'csv' })
    if (scopeId) qs.set('scopeId', scopeId)
    window.open(`/api/audit/export?${qs.toString()}&auth=1`, '_blank')
    // Prefer fetch download with auth header
    void fetch(`/api/audit/export?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${secret}` },
    }).then(async (res) => {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'sdaia-audit.csv'
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <section className="border-t border-ab-border px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">سجل تدقيق SDAIA</h2>
        <button
          onClick={exportCsv}
          className="rounded-md bg-ab-ink px-3 py-2 text-sm text-white"
        >
          تصدير التقرير التنظيمي (SDAIA Audit Export)
        </button>
      </div>
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
          <option value="TIER_1_LOW">TIER_1_LOW</option>
          <option value="TIER_2_MEDIUM">TIER_2_MEDIUM</option>
          <option value="TIER_3_HIGH">TIER_3_HIGH</option>
          <option value="TIER_4_CRITICAL">TIER_4_CRITICAL</option>
        </select>
        <button
          onClick={() => void load()}
          className="rounded-md border border-ab-border px-3 py-2 text-sm"
        >
          تحديث
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-ab-border bg-ab-surface">
        <table className="min-w-full text-sm">
          <thead className="bg-ab-bg text-stone-600">
            <tr>
              <th className="px-3 py-2 text-right">معرف العملية</th>
              <th className="px-3 py-2 text-right">تاريخ التنفيذ</th>
              <th className="px-3 py-2 text-right">تصنيف المخاطر (SDAIA)</th>
              <th className="px-3 py-2 text-right">موقع معالجة البيانات</th>
              <th className="px-3 py-2 text-right">توقيع التحقق</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-t border-ab-border">
                <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                  {row.id.slice(0, 8)}…
                </td>
                <td className="px-3 py-2">
                  {new Date(row.timestamp).toLocaleString('ar-SA')}
                </td>
                <td className="px-3 py-2">{row.riskTier}</td>
                <td className="px-3 py-2">{row.dataLocality}</td>
                <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                  {row.watermarkSignature.slice(0, 16)}…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
