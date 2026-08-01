'use client'

import { useState } from 'react'
import { TrustBadge } from '@/components/trust-badge'

type Props = {
  approvalId: string
  actionName: string
  params: Record<string, unknown>
  riskLevel: 'LOW' | 'HIGH'
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
  autonomyHint?: 'IN_LOOP' | 'ON_LOOP'
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
  const [draft, setDraft] = useState(JSON.stringify(params, null, 2))
  const [localStatus, setLocalStatus] = useState(status)
  const [message, setMessage] = useState('')
  const disabled = localStatus !== 'PENDING_APPROVAL' || busy

  async function decide(decision: 'APPROVE' | 'REJECT', modified?: object) {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/agent/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'user-1',
          'x-org-id': 'org-demo',
        },
        body: JSON.stringify({
          approvalId,
          decision,
          modifiedParams: modified,
          userId: 'user-1',
          orgId: 'org-demo',
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
            ? 'تمت الموافقة وتنفيذ الإجراء.'
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
    <div className="mb-4 rounded-lg border border-ab-border bg-ab-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-ab-warn/10 px-2 py-0.5 text-xs font-semibold text-ab-warn">
          إجراء يحتاج موافقة
        </span>
        <span
          className={`rounded-md px-2 py-0.5 text-xs ${
            riskLevel === 'HIGH'
              ? 'bg-ab-warn/15 text-ab-warn'
              : 'bg-ab-accent/10 text-ab-accent'
          }`}
        >
          {riskLevel}
        </span>
        <TrustBadge tier={autonomyHint} />
      </div>
      <div className="mb-2 font-medium" dir="ltr">
        {actionName}
      </div>
      {editing ? (
        <textarea
          dir="ltr"
          className="mb-3 w-full rounded-lg bg-stone-900 p-3 font-mono text-left text-sm text-stone-100"
          rows={8}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <div
          dir="ltr"
          className="font-mono bg-stone-900 text-stone-100 p-3 rounded-lg text-left my-2 text-sm overflow-x-auto"
        >
          <pre>{JSON.stringify(params, null, 2)}</pre>
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
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          موافقة وتنفيذ
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setEditing((v) => !v)}
          className="rounded-md bg-ab-warn px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          {editing ? 'إلغاء التعديل' : 'تعديل المعاملات'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void decide('REJECT')}
          className="rounded-md bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          رفض الإجراء
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
        <p className="mt-2 text-xs text-stone-500">الحالة: {localStatus}</p>
      )}
    </div>
  )
}
