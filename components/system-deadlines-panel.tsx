'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlarmClock, Loader2 } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

type Kind = { id: string; labelAr: string }
type Upcoming = {
  id: string
  labelAr: string
  daysLeft: number
  startsAt: string
}

export function SystemDeadlinesPanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [kinds, setKinds] = useState<Kind[]>([])
  const [upcoming, setUpcoming] = useState<Upcoming[]>([])
  const [kind, setKind] = useState('license_expiry')
  const [dateYmd, setDateYmd] = useState('')
  const [notesAr, setNotesAr] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/rooms/deadlines?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        kinds?: Kind[]
        upcoming?: Upcoming[]
        error?: string
      }
      setKinds(data.kinds || [])
      setUpcoming(data.upcoming || [])
      if (data.kinds?.[0] && !kind) setKind(data.kinds[0].id)
    } catch {
      /* ignore */
    }
  }, [scopeId, kind])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!dateYmd) {
      setNote('اختر تاريخاً')
      return
    }
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/rooms/deadlines', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scopeId, kind, dateYmd, notesAr }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setNote(data.messageAr || 'تم')
      await load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-ab-border bg-white p-4 text-sm" dir="rtl">
      <h3 className="mb-1 flex items-center gap-1.5 font-semibold">
        <AlarmClock className="h-4 w-4 text-ab-accent" aria-hidden />
        مواعيد النظام
      </h3>
      <p className="mb-3 text-xs text-stone-500">
        انتهاء الترخيص · الجمعية العمومية · التقرير السنوي — على التقويم المشترك.
      </p>
      <div className="mb-2 grid gap-2 sm:grid-cols-3">
        <select
          className="rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {(kinds.length
            ? kinds
            : [
                { id: 'license_expiry', labelAr: 'انتهاء ترخيص الجمعية' },
                { id: 'general_assembly', labelAr: 'الجمعية العمومية' },
                { id: 'annual_report', labelAr: 'التقرير السنوي' },
              ]
          ).map((k) => (
            <option key={k.id} value={k.id}>
              {k.labelAr}
            </option>
          ))}
        </select>
        <input
          type="date"
          dir="ltr"
          className="rounded-md border border-ab-border px-2 py-1.5 text-xs"
          value={dateYmd}
          onChange={(e) => setDateYmd(e.target.value)}
        />
        <input
          className="rounded-md border border-ab-border px-2 py-1.5 text-xs"
          placeholder="ملاحظة اختيارية"
          value={notesAr}
          onChange={(e) => setNotesAr(e.target.value)}
        />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="inline-flex items-center gap-1.5 rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        حفظ على التقويم
      </button>
      {upcoming.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {upcoming.map((u) => (
            <li
              key={u.id}
              className="flex justify-between gap-2 border-b border-stone-100 py-1"
            >
              <span className="font-medium">{u.labelAr}</span>
              <span className="text-stone-500">
                {u.daysLeft < 0
                  ? `متأخر ${Math.abs(u.daysLeft)} يوم`
                  : `بعد ${u.daysLeft} يوم`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {note ? (
        <p className="mt-2 text-xs text-stone-600" role="status">
          {note}
        </p>
      ) : null}
    </div>
  )
}
