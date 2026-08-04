'use client'

import { useMemo, useState } from 'react'
import { TrustBadge } from '@/components/trust-badge'
import { authHeaders } from '@/lib/supabase/browser'

type Props = {
  approvalId: string
  actionName: string
  params: Record<string, unknown>
  riskLevel: 'LOW' | 'HIGH'
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
  autonomyHint?: 'IN_LOOP' | 'ON_LOOP'
}

const ACTION_LABELS_AR: Record<string, string> = {
  send_email: 'إرسال بريد',
  create_calendar_event: 'إنشاء موعد Google',
  room_calendar_create: 'إضافة لتقويم الغرفة',
  room_calendar_ingest: 'دمج مواعيد الفريق',
  room_calendar_update: 'تعديل موعد الغرفة',
  room_calendar_cancel: 'إلغاء موعد الغرفة',
  room_tasks_create: 'إضافة مهمة للغرفة',
  room_tasks_update: 'تعديل مهمة الغرفة',
  room_tasks_reconcile: 'إعادة ترتيب مهام الغرفة',
  room_memory_add: 'حفظ في ذاكرة الغرفة',
  pdf_create: 'إنشاء PDF',
  pdf_stamp: 'ختم على PDF',
  pdf_merge: 'دمج PDF',
  pdf_fill_form: 'تعبئة نموذج PDF',
  delete_file: 'حذف ملف',
  write_file: 'كتابة ملف',
  transfer_funds: 'تحويل مالي',
  web_search: 'بحث ويب',
  drive_upload: 'رفع إلى Drive',
}

function humanizeAction(name: string) {
  return ACTION_LABELS_AR[name] || name.replace(/_/g, ' ')
}

function paramRows(params: Record<string, unknown>) {
  return Object.entries(params).map(([k, v]) => {
    let display: string
    if (v == null) display = '—'
    else if (typeof v === 'string') display = v
    else if (typeof v === 'number' || typeof v === 'boolean') display = String(v)
    else display = JSON.stringify(v)
    return { key: k, display: display.slice(0, 400) }
  })
}

export function ApprovalCard({
  approvalId,
  actionName,
  params,
  riskLevel,
  status,
  autonomyHint = 'IN_LOOP',
}: Props) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [draft, setDraft] = useState(JSON.stringify(params, null, 2))
  const [localStatus, setLocalStatus] = useState(status)
  const [message, setMessage] = useState('')
  const disabled = localStatus !== 'PENDING_APPROVAL' || busy
  const rows = useMemo(() => paramRows(params), [params])

  async function decide(decision: 'APPROVE' | 'REJECT', modified?: object) {
    if (
      decision === 'APPROVE' &&
      riskLevel === 'HIGH' &&
      !window.confirm(
        `تأكيد اعتماد إجراء عالي المخاطر «${humanizeAction(actionName)}»؟ لا يمكن التراجع بعد التنفيذ.`
      )
    ) {
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/agent/approve', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          approvalId,
          decision,
          modifiedParams: modified,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        status?: string
      }
      if (res.ok) {
        setLocalStatus(decision === 'APPROVE' ? 'APPROVED' : 'REJECTED')
        setMessage(
          decision === 'APPROVE'
            ? 'تم الاعتماد وتنفيذ الإجراء.'
            : 'تم رفض الإجراء.'
        )
      } else {
        setMessage(data.error || `تعذّر القرار (HTTP ${res.status})`)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'خطأ في الاتصال')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-ab-border bg-ab-surface p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-ab-warn/10 px-2 py-0.5 text-xs font-semibold text-ab-warn">
          بانتظار قرارك
        </span>
        <span
          className={`rounded-md px-2 py-0.5 text-xs ${
            riskLevel === 'HIGH'
              ? 'bg-ab-warn/15 text-ab-warn'
              : 'bg-ab-accent/10 text-ab-accent'
          }`}
        >
          {riskLevel === 'HIGH' ? 'مخاطر عالية' : 'مخاطر منخفضة'}
        </span>
        <TrustBadge tier={autonomyHint} />
      </div>
      <div className="mb-1 text-base font-semibold text-ab-ink">
        {humanizeAction(actionName)}
      </div>
      <p className="mb-3 text-[11px] text-stone-400" dir="ltr">
        {actionName}
      </p>

      {editing ? (
        <div className="mb-3 space-y-2">
          <p className="text-[11px] text-stone-500">
            عدّل المعاملات ثم اضغط اعتماد — يظهر الفرق مقابل الأصل أدناه.
          </p>
          <textarea
            dir="ltr"
            className="w-full rounded-lg bg-stone-900 p-3 font-mono text-left text-sm text-stone-100"
            rows={8}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div
            dir="ltr"
            className="rounded-lg border border-dashed border-ab-border bg-stone-50 p-2 font-mono text-[10px] text-stone-600"
          >
            <p className="mb-1 font-sans text-[11px] text-stone-500">الأصل</p>
            <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-left">
              {JSON.stringify(params, null, 2)}
            </pre>
          </div>
        </div>
      ) : (
        <div className="mb-3 overflow-hidden rounded-lg border border-ab-border bg-white">
          {rows.length === 0 ? (
            <p className="px-3 py-2 text-xs text-stone-500">لا معاملات</p>
          ) : (
            <dl className="divide-y divide-ab-border text-sm">
              {rows.map((r) => (
                <div
                  key={r.key}
                  className="grid grid-cols-[7rem_1fr] gap-2 px-3 py-2"
                >
                  <dt className="truncate text-[11px] font-medium text-stone-500" dir="ltr">
                    {r.key}
                  </dt>
                  <dd className="break-words text-[12px] text-ab-ink" dir="auto">
                    {r.display}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="w-full border-t border-ab-border px-3 py-1.5 text-[10px] text-stone-400 hover:bg-stone-50"
          >
            {showRaw ? 'إخفاء JSON' : 'عرض JSON الخام'}
          </button>
          {showRaw && (
            <pre
              dir="ltr"
              className="max-h-40 overflow-auto border-t border-ab-border bg-stone-900 p-3 text-left font-mono text-[11px] text-stone-100"
            >
              {JSON.stringify(params, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            let modified: object | undefined
            if (editing) {
              try {
                modified = JSON.parse(draft)
              } catch {
                setMessage('JSON غير صالح في المعاملات.')
                return
              }
            }
            void decide('APPROVE', modified)
          }}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          اعتماد
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setEditing((v) => !v)}
          className="rounded-md border border-ab-warn bg-ab-warn/10 px-4 py-2 text-sm font-medium text-ab-warn disabled:opacity-40"
        >
          {editing ? 'إلغاء التعديل' : 'تعديل'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void decide('REJECT')}
          className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          رفض
        </button>
      </div>
      {message && (
        <p
          className={`mt-2 text-xs ${
            localStatus === 'PENDING_APPROVAL' && message.includes('تعذّر')
              ? 'text-ab-warn'
              : 'text-stone-600'
          }`}
        >
          {message}
        </p>
      )}
      {localStatus !== 'PENDING_APPROVAL' && (
        <p className="mt-2 text-xs text-stone-500">
          الحالة:{' '}
          {localStatus === 'APPROVED' ? 'مُعتمد' : 'مرفوض'}
        </p>
      )}
    </div>
  )
}
