'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
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
  gmail_send: 'إرسال بريد Gmail',
  sheets_write: 'كتابة Google Sheets',
  create_calendar_event: 'إنشاء موعد Google',
  calendar_create_event: 'إنشاء موعد Google',
  calendar_update_event: 'تعديل موعد Google',
  calendar_delete_event: 'حذف موعد Google',
  room_calendar_create: 'إضافة لتقويم الفريق المشترك',
  room_calendar_ingest: 'دمج مواعيد الفريق',
  room_calendar_update: 'تعديل موعد تقويم الفريق',
  room_calendar_cancel: 'إلغاء موعد من تقويم الفريق',
  room_calendar_reconcile: 'ترتيب تقويم الفريق',
  room_tasks_create: 'إضافة مهمة للغرفة',
  room_tasks_update: 'تعديل مهمة الغرفة',
  room_tasks_reconcile: 'إعادة ترتيب مهام الغرفة',
  room_memory_add: 'حفظ في ذاكرة الغرفة',
  pdf_create: 'إنشاء PDF',
  pdf_stamp: 'ختم على PDF',
  pdf_merge: 'دمج PDF',
  pdf_fill_form: 'تعبئة نموذج PDF',
  convert_document: 'تحويل صيغة الملف',
  convert_file: 'تحويل صيغة الملف',
  brain_open_document: 'فتح ملف من عقل الشركة',
  brain_save_document: 'حفظ إلى Drive / العقل',
  brain_create_document: 'رفع ملف جديد إلى Drive',
  brain_delete_document: 'حذف ملف من Drive',
  fill_policy_audit: 'تعبئة نموذج تدقيق Excel',
  send_director_digest: 'ملخص ما ينتظر قرارك',
  edit_document: 'إنشاء أو تعديل مستند',
  edit_excel: 'تعديل خلايا Excel',
  read_excel: 'قراءة Excel',
  edit_image: 'تعديل صورة',
  generate_image_edit: 'تعديل صورة توليدي',
  return_file: 'إرفاق ملف في الشات',
  ingest_url_to_brain: 'سحب صفحة إلى المعرفة',
  read_decision_document: 'قراءة قرار للمستندات',
  report_room_attendance: 'تقرير أعضاء وحضور',
  browser_rpa: 'أتمتة متصفح',
  delete_file: 'حذف ملف',
  delete_database: 'حذف قاعدة بيانات',
  db_delete: 'حذف من قاعدة البيانات',
  write_file: 'كتابة ملف',
  transfer_funds: 'تحويل مالي',
  web_search: 'بحث ويب',
  drive_upload: 'رفع إلى Drive',
  drive_sync_brain: 'مزامنة Drive → العقل',
}

function isDeleteAction(name: string) {
  return (
    name === 'delete_file' ||
    name === 'brain_delete_document' ||
    name === 'calendar_delete_event' ||
    name === 'room_calendar_cancel' ||
    name === 'db_delete' ||
    name === 'delete_database' ||
    /(?:^|_)(delete|trash|remove)(?:_|$)/i.test(name)
  )
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
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [draft, setDraft] = useState(JSON.stringify(params, null, 2))
  const [localStatus, setLocalStatus] = useState(status)
  const [message, setMessage] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const disabled = localStatus !== 'PENDING_APPROVAL' || busy
  const rows = useMemo(() => paramRows(params), [params])
  const deleteAction = isDeleteAction(actionName)

  async function decide(decision: 'APPROVE' | 'REJECT', modified?: object) {
    setBusy(true)
    setMessage('')
    setNeedsLogin(false)
    setConfirmApprove(false)
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
        code?: string
      }
      if (res.ok) {
        setLocalStatus(decision === 'APPROVE' ? 'APPROVED' : 'REJECTED')
        setMessage(
          decision === 'APPROVE'
            ? 'تم الاعتماد وتنفيذ الإجراء.'
            : 'تم رفض الإجراء.'
        )
        try {
          window.dispatchEvent(new CustomEvent('ab-approvals-changed'))
        } catch {
          /* ignore */
        }
        return
      }
      if (res.status === 401 || data.code === 'AUTH_REQUIRED') {
        setNeedsLogin(true)
        setMessage(
          data.error || 'يلزم تسجيل الدخول للموافقة على الإجراءات الحقيقية.'
        )
        return
      }
      setMessage(data.error || `تعذّر القرار (HTTP ${res.status})`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'خطأ في الاتصال')
    } finally {
      setBusy(false)
    }
  }

  function onApproveClick() {
    let modified: object | undefined
    if (editing) {
      try {
        modified = JSON.parse(draft)
      } catch {
        setMessage('JSON غير صالح في المعاملات.')
        return
      }
    }
    // Inline confirm for delete / high-risk — window.confirm is unreliable on mobile.
    if ((deleteAction || riskLevel === 'HIGH') && !confirmApprove) {
      setConfirmApprove(true)
      setMessage(
        deleteAction
          ? `تأكيد حذف «${humanizeAction(actionName)}»؟ لا يمكن التراجع بعد التنفيذ.`
          : `تأكيد موافقة عالية المخاطر على «${humanizeAction(actionName)}»؟ لا يمكن التراجع بعد التنفيذ.`
      )
      return
    }
    void decide('APPROVE', modified)
  }

  return (
    <div
      className={`relative z-10 mb-4 rounded-xl border bg-ab-surface p-4 shadow-sm ${
        deleteAction
          ? 'border-ab-warn/60 ring-1 ring-ab-warn/20'
          : 'border-ab-border'
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-ab-warn/10 px-2 py-0.5 text-xs font-semibold text-ab-warn">
          بانتظار قرارك
        </span>
        {deleteAction ? (
          <span className="rounded-md bg-ab-warn/20 px-2 py-0.5 text-xs font-semibold text-ab-warn">
            حذف — موافقة مطلوبة
          </span>
        ) : null}
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
      <p className="mb-3 text-[11px] text-ab-muted-soft" dir="ltr">
        {actionName}
      </p>

      {editing ? (
        <div className="mb-3 space-y-2">
          <p className="text-[11px] text-stone-500">
            عدّل المعاملات ثم اضغط موافقة — يظهر الفرق مقابل الأصل أدناه.
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
            className="w-full border-t border-ab-border px-3 py-1.5 text-[10px] text-ab-muted-soft hover:bg-stone-50"
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

      <div className="relative z-10 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onApproveClick}
          className="min-h-11 touch-manipulation rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy
            ? 'جاري التنفيذ…'
            : confirmApprove
              ? 'تأكيد الموافقة والتنفيذ'
              : 'موافقة'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setConfirmApprove(false)
            setEditing((v) => !v)
          }}
          className="min-h-11 touch-manipulation rounded-md border border-ab-warn bg-ab-warn/10 px-4 py-2.5 text-sm font-medium text-ab-warn disabled:opacity-40"
        >
          {editing ? 'إلغاء التعديل' : 'تعديل'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setConfirmApprove(false)
            void decide('REJECT')
          }}
          className="min-h-11 touch-manipulation rounded-md bg-red-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          رفض
        </button>
        {confirmApprove && !busy && (
          <button
            type="button"
            onClick={() => {
              setConfirmApprove(false)
              setMessage('')
            }}
            className="min-h-11 touch-manipulation rounded-md border border-ab-border bg-white px-3 py-2.5 text-sm text-stone-600"
          >
            إلغاء
          </button>
        )}
      </div>
      {message && (
        <p
          className={`mt-2 text-xs ${
            localStatus === 'PENDING_APPROVAL'
              ? 'text-ab-warn'
              : 'text-stone-600'
          }`}
          role="status"
        >
          {message}
        </p>
      )}
      {needsLogin && (
        <Link
          href="/auth/login"
          className="mt-2 inline-block rounded-md bg-ab-accent px-3 py-2 text-xs font-semibold text-white"
        >
          سجّل الدخول للموافقة
        </Link>
      )}
      {localStatus !== 'PENDING_APPROVAL' && (
        <p className="mt-2 text-xs text-stone-500">
          الحالة:{' '}
          {localStatus === 'APPROVED' ? 'مُعتمد' : 'مرفوض'}
        </p>
      )}
      {localStatus === 'PENDING_APPROVAL' && (
        <p className="mt-3 border-t border-ab-border/70 pt-2 text-[10px] leading-relaxed text-stone-500">
          الموافقة هنا تنفّذ الإجراء فوراً. نفس الطلب يصل على تيليجرام (أزرار أو{' '}
          <code dir="ltr">/approve</code>
          ). النتيجة تُسجَّل في سجل التدقيق.
        </p>
      )}
    </div>
  )
}
