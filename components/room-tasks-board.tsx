'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckSquare, ListOrdered, Plus, Sparkles } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

type Task = {
  id: string
  titleAr: string
  notesAr: string | null
  status: string
  priority: number
  dueAt: string | null
  assigneeAr: string | null
  sortOrder: number
  source: string
}

function fmtDue(iso: string | null) {
  if (!iso) return 'بدون موعد'
  try {
    return new Date(iso).toLocaleString('ar-SA', {
      timeZone: 'Asia/Riyadh',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** Shared tasks/orders whiteboard for the room + AI reconcile. */
export function RoomTasksBoard() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/rooms/tasks?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as { tasks?: Task[] }
      setTasks(data.tasks || [])
    } catch {
      /* ignore */
    }
  }, [scopeId])

  useEffect(() => {
    void load()
    try {
      localStorage.setItem('ab-room-collab-seen', '1')
      window.dispatchEvent(new Event('ab-room-collab-seen'))
    } catch {
      /* ignore */
    }
  }, [load])

  async function add() {
    if (!title.trim() || busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await fetch('/api/rooms/tasks', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          titleAr: title.trim(),
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setMsg(data.messageAr || 'تمت الإضافة')
      setTitle('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function reconcile() {
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch('/api/rooms/tasks', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'reconcile', scopeId }),
      })
      const data = (await res.json()) as { messageAr?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setMsg(data.messageAr || 'تم الضبط')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(id: string, status: string) {
    await fetch('/api/rooms/tasks', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        action: 'update',
        scopeId,
        taskId: id,
        patch: { status },
      }),
    })
    await load()
  }

  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')

  return (
    <section className="space-y-3" dir="rtl">
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-ab-ink">
          <CheckSquare className="h-5 w-5 text-ab-accent" />
          لوحة المهام والطلبات
        </h2>
        <p className="text-xs text-stone-500">
          مشتركة للغرفة كلها — ليست قائمة شخص واحد. الوكيل يرتّب الأولوية ويعدّل
          المواعيد المتأخرة.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-ab-border bg-ab-surface p-3">
        <input
          className="min-w-[12rem] flex-1 rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
          placeholder="مهمة أو طلب جديد…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="datetime-local"
          className="rounded-md border border-ab-border bg-white px-2 py-2 text-xs"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          dir="ltr"
        />
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={() => void add()}
          className="inline-flex items-center gap-1 rounded-md bg-ab-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> أضف
        </button>
        <button
          type="button"
          disabled={busy || open.length === 0}
          onClick={() => void reconcile()}
          className="inline-flex items-center gap-1 rounded-md bg-stone-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Sparkles className="h-3.5 w-3.5" />
          رتّب وعدّل المواعيد
        </button>
      </div>

      {msg && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {msg}
        </p>
      )}
      {err && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>
      )}

      <ul className="divide-y divide-ab-border rounded-xl border border-ab-border bg-white">
        {open.length === 0 ? (
          <li className="p-6 text-center text-sm text-stone-400">
            لا مهام — أضف يدوياً أو اطلب من الوكيل: «أضف طلباً… إلى لوحة الغرفة».
          </li>
        ) : (
          open.map((t, i) => (
            <li
              key={t.id}
              className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-ab-ink">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-500">
                    {i + 1}
                  </span>
                  {t.titleAr}
                </p>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  <ListOrdered className="mr-1 inline h-3 w-3" />
                  أولوية {t.priority} · {fmtDue(t.dueAt)}
                  {t.assigneeAr ? ` · ${t.assigneeAr}` : ''}
                  {t.source === 'ai' ? ' · وكيل' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void setStatus(t.id, 'done')}
                className="rounded-md border border-emerald-600/30 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800"
              >
                تم
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
