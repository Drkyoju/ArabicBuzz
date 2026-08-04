'use client'

import { useCallback, useEffect, useState } from 'react'

type Log = {
  id: string
  taskNameAr: string
  ranAt: string
  channel: string
  status: string
  details?: string | null
}

export function CronStatusTable({
  reloadToken = 0,
}: {
  reloadToken?: number
}) {
  const [logs, setLogs] = useState<Log[]>([])
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setError('')
    void fetch('/api/crons/logs')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) =>
        setLogs(
          (d.logs || []).map(
            (l: Log & { ranAt: string | Date }) => ({
              ...l,
              ranAt:
                typeof l.ranAt === 'string'
                  ? l.ranAt
                  : new Date(l.ranAt).toISOString(),
            })
          )
        )
      )
      .catch((e) => {
        setLogs([])
        setError(e instanceof Error ? e.message : 'تعذّر تحميل السجل')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load, reloadToken])

  return (
    <section className="rounded-lg border border-ab-border bg-ab-surface">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-ab-bg text-stone-600">
            <tr>
              <th className="px-3 py-2 text-right font-medium">المهمة</th>
              <th className="px-3 py-2 text-right font-medium">القناة</th>
              <th className="px-3 py-2 text-right font-medium">الحالة</th>
              <th className="px-3 py-2 text-right font-medium">الوقت</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-stone-500"
                >
                  {error || 'لا سجل تشغيل بعد — سجّل مهمة أعلاه ثم انتظر أول تشغيل.'}
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id} className="border-t border-ab-border">
                  <td className="px-3 py-2">{l.taskNameAr}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {l.channel}
                  </td>
                  <td className="px-3 py-2">{l.status}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {new Date(l.ranAt).toLocaleString('ar-SA')}
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
