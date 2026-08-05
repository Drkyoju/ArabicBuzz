'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileStack, Loader2 } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

export function AccreditationExportPanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const signedIn = useSignedIn()
  const isGuest = signedIn === false
  const [titleAr, setTitleAr] = useState('حزمة اعتماد — محضر الاجتماع')
  const [meetingDateAr, setMeetingDateAr] = useState('')
  const [minutesAr, setMinutesAr] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function exportPack() {
    setBusy(true)
    setNote('جاري تجهيز PDF بختم التدقيق…')
    try {
      const res = await fetch('/api/rooms/export-pack', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          titleAr,
          meetingDateAr: meetingDateAr || undefined,
          minutesAr,
          includeAttendance: true,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        fileName?: string
      }
      if (!res.ok) throw new Error(data.error || 'فشل التصدير')
      setNote(data.messageAr || `صُدّر ${data.fileName}`)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-ab-border bg-white p-4 text-sm" dir="rtl">
      <h3 className="mb-1 flex items-center gap-1.5 font-semibold">
        <FileStack className="h-4 w-4 text-ab-accent" aria-hidden />
        تصدير حزمة اعتماد
      </h3>
      <p className="mb-3 text-xs text-stone-500">
        محضر + حضور + فهرس ملفات — PDF واحد بختم التدقيق في ملفات الغرفة.
      </p>
      <input
        className="mb-2 w-full rounded-md border border-ab-border px-3 py-2 text-sm"
        value={titleAr}
        onChange={(e) => setTitleAr(e.target.value)}
        placeholder="عنوان الحزمة"
      />
      <input
        className="mb-2 w-full rounded-md border border-ab-border px-3 py-2 text-sm"
        value={meetingDateAr}
        onChange={(e) => setMeetingDateAr(e.target.value)}
        placeholder="تاريخ الاجتماع (اختياري)"
      />
      <textarea
        className="mb-3 w-full rounded-md border border-ab-border px-3 py-2 text-sm"
        rows={5}
        value={minutesAr}
        onChange={(e) => setMinutesAr(e.target.value)}
        placeholder="الصق نص المحضر هنا…"
      />
      <button
        type="button"
        disabled={busy || isGuest}
        onClick={() => void exportPack()}
        title={
          isGuest
            ? 'التصدير يحتاج تسجيل الدخول — الحزمة تُحفظ في ملفات الغرفة.'
            : undefined
        }
        aria-disabled={busy || isGuest}
        className="inline-flex items-center gap-1.5 rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileStack className="h-3.5 w-3.5" />}
        تصدير PDF بختم التدقيق
      </button>
      {isGuest && (
        <p className="mt-2 text-xs text-amber-800">
          التصدير يحتاج تسجيل الدخول لأن الحزمة تُحفظ في ملفات الغرفة.{' '}
          <Link href="/auth/login" className="font-semibold underline">
            سجّل الدخول
          </Link>
        </p>
      )}
      {note ? (
        <p className="mt-2 text-xs text-stone-600" role="status">
          {note}
        </p>
      ) : null}
    </div>
  )
}
