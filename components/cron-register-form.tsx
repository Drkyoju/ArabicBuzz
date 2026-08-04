'use client'

import { useState } from 'react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

/** Compact form to register a scheduled morning/ops task. */
export function CronRegisterForm({ onCreated }: { onCreated?: () => void }) {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [nameAr, setNameAr] = useState('ملخص صباحي')
  const [prompt, setPrompt] = useState('لخّص نشاط الغرفة لليوم بالعربية الفصحى.')
  const [hour, setHour] = useState(9)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function submit() {
    setBusy(true)
    setMsg('')
    setErr('')
    try {
      const res = await fetch('/api/crons/register', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          nameAr: nameAr.trim(),
          prompt: prompt.trim(),
          hour,
          notifyChannels: ['telegram'],
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        cronExpr?: string
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMsg(data.messageAr || `تم التسجيل · ${data.cronExpr || ''}`)
      onCreated?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل التسجيل')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="rounded-xl border border-ab-border bg-ab-surface p-4 text-sm"
      dir="rtl"
    >
      <h3 className="mb-2 font-semibold text-ab-ink">جدولة مهمة جديدة</h3>
      <p className="mb-3 text-[11px] text-stone-500">
        للمساحة الحالية. يُشغَّل يومياً في الوقت المحدد (توقيت الرياض).
      </p>
      <div className="space-y-2">
        <input
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
          placeholder="اسم المهمة"
          className="w-full rounded-md border border-ab-border px-3 py-2 text-sm"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="نص المهمة للوكيل"
          className="w-full rounded-md border border-ab-border px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-stone-600">
          الساعة يومياً (الرياض)
          <input
            type="number"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value) || 9)}
            className="w-16 rounded-md border border-ab-border px-2 py-1"
            dir="ltr"
          />
        </label>
        <button
          type="button"
          disabled={busy || !nameAr.trim() || !prompt.trim()}
          onClick={() => void submit()}
          className="rounded-md bg-ab-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          تسجيل المهمة
        </button>
        {msg && <p className="text-xs text-emerald-700">{msg}</p>}
        {err && <p className="text-xs text-ab-warn">{err}</p>}
      </div>
    </div>
  )
}
