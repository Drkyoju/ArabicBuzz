'use client'

import { useEffect, useState } from 'react'
import { Brain, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  hydrateScopeMemories,
  useWorkspaceStore,
} from '@/lib/scopes/workspace-store'
import { isPersonalScope } from '@/lib/scopes/manager'

export function MemoryPanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const scopes = useWorkspaceStore((s) => s.scopes)
  const addMemory = useWorkspaceStore((s) => s.addMemory)
  const updateMemory = useWorkspaceStore((s) => s.updateMemory)
  const removeMemory = useWorkspaceStore((s) => s.removeMemory)
  const scope = scopes.find((s) => s.id === scopeId)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    hydrateScopeMemories()
  }, [])

  const memories = scope
    ? isPersonalScope(scope)
      ? scope.privateMemory
      : scope.sharedMemory
    : []

  function saveNew() {
    if (!addMemory(scopeId, draft)) {
      setNote('أدخل نصاً للحفظ.')
      return
    }
    setDraft('')
    setNote('أُضيفت للذاكرة.')
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
      <div className="mb-4">
        <h2 className="text-xl font-bold">ذاكرة المساحة</h2>
        <p className="mt-1 text-sm text-stone-500">
          {scope?.nameAr || scopeId} —{' '}
          {scope && isPersonalScope(scope)
            ? 'ذاكرة خاصة بهذه المساحة'
            : 'ذاكرة مشتركة للغرفة'}
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
          onClick={saveNew}
          className="inline-flex items-center gap-1 rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          حفظ في الذاكرة
        </button>
        {note && (
          <p className="mt-2 text-[11px] text-stone-500">{note}</p>
        )}
      </div>

      {memories.length === 0 ? (
        <div className="relative overflow-hidden rounded-xl border border-dashed border-ab-border bg-gradient-to-bl from-stone-50 via-white to-sky-50/50 px-6 py-14 text-center">
          <Brain className="mx-auto mb-3 h-10 w-10 text-stone-300" aria-hidden />
          <p className="text-base font-semibold text-ab-ink">لا ذكريات محفوظة</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">
            أضف ذكريات يدوياً أو من رسالة في الغرفة عبر «احفظ في الذاكرة».
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {memories.map((m, i) => (
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
                    <span className="ml-2 text-[11px] font-semibold text-stone-400">
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
                      onClick={() => removeMemory(scopeId, i)}
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
        للبحث في عقل الشركة أثناء المحادثة، اطلب من الوكيل الاستناد إلى المصادر.
      </p>
    </section>
  )
}
