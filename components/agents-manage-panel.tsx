'use client'

import { useMemo, useState } from 'react'
import { Bot, Plus, Trash2, X } from 'lucide-react'
import { BUILTIN_ROOM_AGENTS, type RoomAgent } from '@/lib/rooms/agents'
import { useAgentRosterStore } from '@/lib/rooms/agent-roster-store'
import { cn } from '@/lib/utils'

export function AgentsManagePanel({
  scopeId,
  compact,
  className,
}: {
  scopeId: string
  compact?: boolean
  className?: string
}) {
  const agentsForScope = useAgentRosterStore((s) => s.agentsForScope)
  const allAgents = useAgentRosterStore((s) => s.allAgents)
  const customAgents = useAgentRosterStore((s) => s.customAgents)
  const addCustomAgent = useAgentRosterStore((s) => s.addCustomAgent)
  const updateCustomAgent = useAgentRosterStore((s) => s.updateCustomAgent)
  const deleteCustomAgent = useAgentRosterStore((s) => s.deleteCustomAgent)
  const removeAgentFromScope = useAgentRosterStore((s) => s.removeAgentFromScope)
  const addAgentToScope = useAgentRosterStore((s) => s.addAgentToScope)

  const [open, setOpen] = useState(false)
  const [nameAr, setNameAr] = useState('')
  const [slug, setSlug] = useState('')
  const [prompt, setPrompt] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const seated = agentsForScope(scopeId)
  const seatedIds = useMemo(() => new Set(seated.map((a) => a.id)), [seated])
  const catalog = allAgents()

  function resetForm() {
    setNameAr('')
    setSlug('')
    setPrompt('')
    setEditingId(null)
  }

  function startEdit(agent: RoomAgent) {
    setEditingId(agent.id)
    setNameAr(agent.nameAr)
    setSlug(agent.slug)
    setPrompt(agent.systemPromptAr)
    setOpen(true)
  }

  function save() {
    setNote('')
    if (!nameAr.trim()) {
      setNote('أدخل اسم الوكيل.')
      return
    }
    if (editingId) {
      const target = customAgents.find((a) => a.id === editingId)
      if (!target) {
        setNote('لا يمكن تعديل الوكلاء الافتراضيين — أنشئ وكيلًا مخصصًا أو أخفِهم من الغرفة.')
        return
      }
      updateCustomAgent(editingId, {
        nameAr,
        slug: slug || undefined,
        systemPromptAr: prompt,
      })
      setNote('تم تحديث الوكيل.')
    } else {
      const agent = addCustomAgent({
        nameAr,
        slug: slug || undefined,
        systemPromptAr: prompt,
        scopeId,
      })
      setNote(`أُضيف «${agent.nameAr}» (@${agent.slug}) إلى هذه الغرفة.`)
    }
    resetForm()
  }

  return (
    <div className={cn(className)} dir="rtl">
      <div className="flex flex-wrap items-center gap-1.5">
        {!compact && (
          <span className="text-[10px] font-medium text-stone-400">وكلاء</span>
        )}
        <button
          type="button"
          onClick={() => {
            resetForm()
            setOpen((v) => !v)
          }}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-ab-border bg-white px-2 py-0.5 text-[11px] text-ab-ink hover:bg-stone-50"
        >
          {open ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {open ? 'إغلاق' : 'إدارة الوكلاء'}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-3 rounded-xl border border-ab-border bg-ab-surface p-3">
          <div>
            <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <Bot className="h-3.5 w-3.5" aria-hidden />
              {editingId ? 'تعديل وكيل' : 'وكيل جديد'}
            </h4>
            <p className="mb-2 text-[11px] text-stone-500">
              أنشئ وكيلًا باسم وتعليمات خاصة، أو احذف/أخفِ من لا تحتاجه في هذه
              الغرفة.
            </p>
            <div className="space-y-2">
              <input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="الاسم بالعربية (مثل: وكيل العقود)"
                className="w-full rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-xs"
              />
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="اختصار للـ @mention (مثل: contracts)"
                dir="ltr"
                className="w-full rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-left text-xs font-mono"
              />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="تعليمات النظام: كيف يتصرف الوكيل…"
                className="w-full rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-xs"
              />
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={save}
                  className="rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {editingId ? 'حفظ التعديل' : 'إضافة للغرفة'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-md border border-ab-border px-3 py-1.5 text-xs"
                  >
                    إلغاء التعديل
                  </button>
                )}
              </div>
              {note && (
                <p className="text-[11px] text-stone-600">{note}</p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-stone-500">
              في هذه الغرفة ({seated.length})
            </p>
            <ul className="space-y-1.5">
              {seated.map((agent) => (
                <li
                  key={agent.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-[12px]"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {agent.nameAr}
                      {agent.custom ? (
                        <span className="ms-1 text-[10px] text-ab-accent">
                          مخصص
                        </span>
                      ) : (
                        <span className="ms-1 text-[10px] text-stone-400">
                          افتراضي
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-[10px] text-stone-400" dir="ltr">
                      @{agent.slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {agent.custom && (
                      <button
                        type="button"
                        onClick={() => startEdit(agent)}
                        className="rounded-md border border-ab-border px-2 py-1 text-[10px]"
                      >
                        تعديل
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        removeAgentFromScope(scopeId, agent.id)
                        setNote(`أُزيل «${agent.nameAr}» من هذه الغرفة.`)
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[10px] text-ab-warn"
                    >
                      <Trash2 className="h-3 w-3" />
                      إزالة من الغرفة
                    </button>
                    {agent.custom && (
                      <button
                        type="button"
                        onClick={() => {
                          deleteCustomAgent(agent.id)
                          setNote(`حُذف الوكيل المخصص «${agent.nameAr}».`)
                          if (editingId === agent.id) resetForm()
                        }}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-700"
                      >
                        حذف نهائي
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {seated.length === 0 && (
                <li className="text-[11px] text-stone-500">
                  لا وكلاء في هذه الغرفة — أضف وكيلًا جديدًا أو أعد إظهار
                  الافتراضيين.
                </li>
              )}
            </ul>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-stone-500">
              متاحون للإضافة
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {catalog
                .filter((a) => !seatedIds.has(a.id))
                .map((agent) => (
                  <li key={agent.id}>
                    <button
                      type="button"
                      onClick={() => {
                        addAgentToScope(scopeId, agent.id)
                        setNote(`أُضيف «${agent.nameAr}» للغرفة.`)
                      }}
                      className="rounded-md border border-dashed border-ab-border bg-white px-2 py-1 text-[11px] hover:bg-stone-50"
                    >
                      + {agent.nameAr}
                    </button>
                  </li>
                ))}
              {catalog.every((a) => seatedIds.has(a.id)) && (
                <li className="text-[11px] text-stone-400">
                  كل الوكلاء المعروفين موجودون في الغرفة.
                </li>
              )}
            </ul>
            <p className="mt-2 text-[10px] text-stone-400">
              الافتراضيون ({BUILTIN_ROOM_AGENTS.length}) لا يُحذفون من النظام —
              فقط من الغرفة. الوكلاء المخصصون يُحذفون نهائيًا إن اخترت ذلك.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
