'use client'

import { useCallback, useEffect, useState } from 'react'
import { Brain, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  hydrateScopeMemories,
  useWorkspaceStore,
} from '@/lib/scopes/workspace-store'
import { isPersonalScope } from '@/lib/scopes/manager'
import { authHeaders } from '@/lib/supabase/browser'

type RoomMem = {
  id: string
  content: string
  createdByAr?: string | null
  createdAt?: string
}

export function MemoryPanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const scopes = useWorkspaceStore((s) => s.scopes)
  const addMemory = useWorkspaceStore((s) => s.addMemory)
  const updateMemory = useWorkspaceStore((s) => s.updateMemory)
  const removeMemory = useWorkspaceStore((s) => s.removeMemory)
  const scope = scopes.find((s) => s.id === scopeId)
  const personal = scope ? isPersonalScope(scope) : false

  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [note, setNote] = useState('')
  const [roomMemories, setRoomMemories] = useState<RoomMem[]>([])
  const [busy, setBusy] = useState(false)

  const loadRoom = useCallback(async () => {
    if (personal) return
    try {
      const res = await fetch(
        `/api/rooms/memory?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as { memories?: RoomMem[] }
      setRoomMemories(data.memories || [])
    } catch {
      /* ignore */
    }
  }, [scopeId, personal])

  useEffect(() => {
    hydrateScopeMemories()
  }, [])

  useEffect(() => {
    void loadRoom()
  }, [loadRoom])

  const localMemories =
    scope && personal && 'privateMemory' in scope
      ? scope.privateMemory
      : scope && !personal && 'sharedMemory' in scope
        ? scope.sharedMemory
        : []

  async function saveNew() {
    const text = draft.trim()
    if (!text) {
      setNote('أدخل نصاً للحفظ.')
      return
    }
    if (personal) {
      if (!addMemory(scopeId, text)) {
        setNote('أدخل نصاً للحفظ.')
        return
      }
      setDraft('')
      setNote('أُضيفت للذاكرة الخاصة.')
      return
    }
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/rooms/memory', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scopeId, content: text, action: 'add' }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setDraft('')
      setNote(data.messageAr || 'أُضيفت لذاكرة الغرفة المشتركة')
      addMemory(scopeId, text) // keep local cache in sync for chat context
      await loadRoom()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل الحفظ')
    } finally {
      setBusy(false)
    }
  }

  async function removeRoom(id: string) {
    if (!window.confirm('حذف هذه الذكرى من ذاكرة الغرفة؟')) return
    setBusy(true)
    try {
      await fetch('/api/rooms/memory', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scopeId, id, action: 'remove' }),
      })
      await loadRoom()
    } finally {
      setBusy(false)
    }
  }

  const showRoom = !personal
  const empty = showRoom
    ? roomMemories.length === 0
    : localMemories.length === 0

  return (
    <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
      <div className="mb-4">
        <h2 className="text-xl font-bold">
          {showRoom ? 'ذاكرة الغرفة المشتركة' : 'ذاكرة المساحة'}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {scope?.nameAr || scopeId} —{' '}
          {showRoom
            ? 'مشتركة لكل الأعضاء على الخادم — ليست على جهاز أو حساب واحد'
            : 'ذاكرة خاصة بهذه المساحة'}
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-3">
        <p className="mb-2 text-xs font-semibold text-ab-ink">أضف ذكرى</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="مثال: قرار الأسبوع: الموافقة على سياسة المخاطر المنخفضة…"
          className="mb-2 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveNew()}
          className="inline-flex items-center gap-1 rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          حفظ في الذاكرة
        </button>
        {note && (
          <p className="mt-2 text-[11px] text-stone-500">{note}</p>
        )}
      </div>

      {empty ? (
        <div className="relative overflow-hidden rounded-xl border border-dashed border-ab-border bg-gradient-to-bl from-stone-50 via-white to-sky-50/50 px-6 py-14 text-center">
          <Brain className="mx-auto mb-3 h-10 w-10 text-stone-300" aria-hidden />
          <p className="text-base font-semibold text-ab-ink">لا ذكريات محفوظة</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">
            أضف ذكريات يدوياً أو اطلب من الوكيل «احفظ في ذاكرة الغرفة».
          </p>
        </div>
      ) : showRoom ? (
        <ol className="space-y-2">
          {roomMemories.map((m, i) => (
            <li
              key={m.id}
              className="rounded-lg border border-ab-border bg-ab-surface px-3 py-2.5 text-sm leading-relaxed text-ab-ink"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p>
                    <span className="me-2 text-[11px] font-semibold text-ab-muted-soft">
                      {i + 1}.
                    </span>
                    {m.content}
                  </p>
                  {m.createdByAr && (
                    <p className="mt-1 text-[10px] text-ab-muted-soft">
                      {m.createdByAr}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeRoom(m.id)}
                  className="rounded border border-ab-border p-1 text-stone-500 hover:text-red-600"
                  aria-label="حذف"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="space-y-2">
          {localMemories.map((m: string, i: number) => (
            <li
              key={`${i}-${m.slice(0, 24)}`}
              className="rounded-lg border border-ab-border bg-ab-surface px-3 py-2.5 text-sm leading-relaxed text-ab-ink"
            >
              {editing === i ? (
                <div className="space-y-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-ab-border px-2 py-1.5 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        updateMemory(scopeId, i, editText)
                        setEditing(null)
                      }}
                      className="rounded-md bg-ab-ink px-2.5 py-1 text-[11px] text-white"
                    >
                      حفظ
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-md border border-ab-border px-2.5 py-1 text-[11px]"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <p>
                    <span className="me-2 text-[11px] font-semibold text-ab-muted-soft">
                      {i + 1}.
                    </span>
                    {m}
                  </p>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(i)
                        setEditText(m)
                      }}
                      className="rounded border border-ab-border p-1 text-stone-500 hover:text-ab-ink"
                      aria-label="تعديل"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            'حذف هذه الذكرى من ذاكرة المساحة؟'
                          )
                        ) {
                          removeMemory(scopeId, i)
                        }
                      }}
                      className="rounded border border-ab-border p-1 text-stone-500 hover:text-red-600"
                      aria-label="حذف"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="mt-6 text-xs text-stone-500">
        الوكيل يستخدم room_memory_* و memory_search على ذاكرة الغرفة المشتركة.
      </p>
    </section>
  )
}
