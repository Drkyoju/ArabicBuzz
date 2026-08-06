'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, Loader2, Unlink } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

type CommitteeRow = {
  key: string
  labelAr: string
  deepLink: string
  bound: { chatId: string; nameAr: string } | null
}

export function CommitteeTelegramPanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [rows, setRows] = useState<CommitteeRow[]>([])
  const [chatDraft, setChatDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/rooms/committees?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as { committees?: CommitteeRow[] }
      setRows(data.committees || [])
    } catch {
      /* ignore */
    }
  }, [scopeId])

  useEffect(() => {
    void load()
  }, [load])

  async function bind(key: string) {
    const chatId = (chatDraft[key] || '').trim()
    if (!chatId) {
      setNote('الصق معرّف محادثة المجموعة من تيليجرام، أو افتح رابط الدعوة من المجموعة.')
      return
    }
    setBusy(key)
    setNote('')
    try {
      const res = await fetch('/api/rooms/committees', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scopeId, committeeKey: key, chatId }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setNote(data.messageAr || 'تم الربط')
      await load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(null)
    }
  }

  async function unbind(key: string) {
    setBusy(key)
    try {
      await fetch('/api/rooms/committees', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          committeeKey: key,
          action: 'remove',
        }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-ab-border bg-ab-surface p-4 text-sm" dir="rtl">
      <h3 className="mb-1 flex items-center gap-1.5 font-semibold">
        <MessageCircle className="h-4 w-4 text-ab-accent" aria-hidden />
        قنوات تيليجرام للجان
      </h3>
      <ol className="mb-3 list-decimal space-y-1 pe-4 text-xs leading-relaxed text-stone-600">
        <li>
          أنشئ مجموعة تيليجرام للجنة (مالية / برامج / مجلس) وأضف بوت Arabic Buzz
          إليها.
        </li>
        <li>
          من داخل المجموعة اضغط «ربط من تيليجرام» — أو انسخ معرّف المحادثة
          (أرقام سالبة غالباً مثل <span dir="ltr">-100…</span>) والصقه أدناه ثم
          «حفظ المعرّف».
        </li>
        <li>
          لا نخترع معرّفات — المعرّف يظهر من تيليجرام أو من رسالة البوت بعد{' '}
          <code dir="ltr">/start</code> في المجموعة.
        </li>
      </ol>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.key}
            className="rounded-lg border border-ab-border bg-white p-3"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{r.labelAr}</span>
              {r.bound ? (
                <span className="text-[10px] text-emerald-700" dir="ltr">
                  مربوط · {r.bound.chatId}
                </span>
              ) : (
                <span className="text-[10px] text-stone-400">غير مربوط</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={r.deepLink}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-ab-accent px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                ربط من تيليجرام
              </a>
              <input
                dir="ltr"
                className="min-w-[8rem] flex-1 rounded-md border border-ab-border px-2 py-1 font-mono text-[11px]"
                placeholder="-100… معرّف المجموعة"
                value={chatDraft[r.key] || ''}
                onChange={(e) =>
                  setChatDraft((p) => ({ ...p, [r.key]: e.target.value }))
                }
              />
              <button
                type="button"
                disabled={busy === r.key}
                onClick={() => void bind(r.key)}
                className="rounded-md border border-ab-border px-2 py-1 text-[11px] disabled:opacity-50"
              >
                {busy === r.key ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  'حفظ المعرّف'
                )}
              </button>
              {r.bound ? (
                <button
                  type="button"
                  disabled={busy === r.key}
                  onClick={() => void unbind(r.key)}
                  className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[11px] text-stone-600"
                >
                  <Unlink className="h-3 w-3" />
                  فك
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {note ? (
        <p className="mt-2 text-xs text-stone-600" role="status">
          {note}
        </p>
      ) : null}
    </div>
  )
}
