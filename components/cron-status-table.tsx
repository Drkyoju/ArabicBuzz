'use client'

import { useEffect, useState } from 'react'

type Log = {
  id: string
  taskNameAr: string
  ranAt: string
  channel: string
  status: string
  details?: string | null
}

export function CronStatusTable() {
  const [logs, setLogs] = useState<Log[]>([])

  useEffect(() => {
    void fetch('/api/crons/logs')
      .then((r) => r.json())
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
  }, [])

  return (
    <section className="border-t border-ab-border px-4 py-8">
      <h2 className="mb-4 text-xl font-bold">سجل المهام الدورية</h2>
      <div className="overflow-x-auto rounded-lg border border-ab-border bg-ab-surface">
        <table className="min-w-full text-sm">
          <thead className="bg-ab-bg text-stone-600">
            <tr>
              <th className="px-3 py-2 text-right font-medium">اسم المهمة</th>
              <th className="px-3 py-2 text-right font-medium">التوقيت</th>
              <th className="px-3 py-2 text-right font-medium">القناة</th>
              <th className="px-3 py-2 text-right font-medium">حالة التنفيذ</th>
              <th className="px-3 py-2 text-right font-medium">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-ab-border">
                <td className="px-3 py-2">{log.taskNameAr}</td>
                <td className="px-3 py-2" dir="ltr">
                  {new Date(log.ranAt).toLocaleString('ar-SA')}
                </td>
                <td className="px-3 py-2">{log.channel}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      log.status === 'success'
                        ? 'text-emerald-700'
                        : log.status === 'failed'
                          ? 'text-red-700'
                          : 'text-ab-warn'
                    }
                  >
                    {log.status === 'success'
                      ? 'نجاح'
                      : log.status === 'failed'
                        ? 'فشل'
                        : 'جاري'}
                  </span>
                </td>
                <td className="px-3 py-2 max-w-xs truncate">
                  {log.details || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
