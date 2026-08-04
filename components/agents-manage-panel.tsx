'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, Plus, Trash2, Users, X } from 'lucide-react'
import {
  AGENT_MODEL_PRESETS,
  BUILTIN_ROOM_AGENTS,
  type RoomAgent,
} from '@/lib/rooms/agents'
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
  const addCustomAgent = useAgentRosterStore((s) => s.addCustomAgent)
  const addTeamBatch = useAgentRosterStore((s) => s.addTeamBatch)
  const updateAgent = useAgentRosterStore((s) => s.updateAgent)
  const clearAgentOverride = useAgentRosterStore((s) => s.clearAgentOverride)
  const agentOverrides = useAgentRosterStore((s) => s.agentOverrides)
  const deleteCustomAgent = useAgentRosterStore((s) => s.deleteCustomAgent)
  const removeAgentFromScope = useAgentRosterStore((s) => s.removeAgentFromScope)
  const addAgentToScope = useAgentRosterStore((s) => s.addAgentToScope)
  const collabMode = useAgentRosterStore(
    (s) => s.collabModeByScope[scopeId] || 'solo'
  )
  const setCollabMode = useAgentRosterStore((s) => s.setCollabMode)
  const cloudSyncedAt = useAgentRosterStore((s) => s.cloudSyncedAt)

  const [open, setOpen] = useState(false)
  const [nameAr, setNameAr] = useState('')
  const [slug, setSlug] = useState('')
  const [taskAr, setTaskAr] = useState('')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('gemini-2.5-pro')
  const [batchCount, setBatchCount] = useState(5)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const seated = agentsForScope(scopeId)
  const seatedIds = useMemo(() => new Set(seated.map((a) => a.id)), [seated])
  const catalog = allAgents()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function resetForm() {
    setNameAr('')
    setSlug('')
    setTaskAr('')
    setPrompt('')
    setModel('gemini-2.5-pro')
    setEditingId(null)
  }

  function startEdit(agent: RoomAgent) {
    setEditingId(agent.id)
    setNameAr(agent.nameAr)
    setSlug(agent.slug)
    setTaskAr(agent.taskAr || '')
    setPrompt(agent.systemPromptAr)
    setModel(agent.preferredModel || 'gemini-2.5-pro')
    setOpen(true)
  }

  function save() {
    setNote('')
    if (!nameAr.trim()) {
      setNote('أدخل اسم الوكيل.')
      return
    }
    if (editingId) {
      updateAgent(editingId, {
        nameAr,
        slug: slug || undefined,
        systemPromptAr: prompt,
        taskAr,
        preferredModel: model,
      })
      setNote('تم تحديث الوكيل.')
    } else {
      const agent = addCustomAgent({
        nameAr,
        slug: slug || undefined,
        systemPromptAr: prompt,
        taskAr,
        preferredModel: model,
        scopeId,
      })
      setNote(`أُضيف «${agent.nameAr}» (@${agent.slug}) · ${model}`)
    }
    resetForm()
  }

  function modelLabel(slug?: string) {
    return (
      AGENT_MODEL_PRESETS.find((m) => m.slug === slug)?.labelAr ||
      slug ||
      'نموذج الغرفة'
    )
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
            setOpen(true)
          }}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-ab-border bg-white px-2 py-0.5 text-[11px] text-ab-ink hover:bg-stone-50"
        >
          <Plus className="h-3 w-3" />
          إدارة الوكلاء
        </button>
        <div className="inline-flex rounded-md border border-ab-border bg-white p-0.5 text-[10px]">
          <button
            type="button"
            onClick={() => setCollabMode(scopeId, 'solo')}
            className={cn(
              'rounded px-2 py-0.5',
              collabMode === 'solo'
                ? 'bg-ab-ink text-white'
                : 'text-stone-600 hover:bg-stone-50'
            )}
          >
            منفصل
          </button>
          <button
            type="button"
            onClick={() => setCollabMode(scopeId, 'team')}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5',
              collabMode === 'team'
                ? 'bg-ab-accent text-white'
                : 'text-stone-600 hover:bg-stone-50'
            )}
          >
            <Users className="h-3 w-3" />
            تعاون
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="إدارة الوكلاء"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ab-border bg-ab-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-ab-border px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-ab-ink">إدارة الوكلاء</h3>
                <p className="text-[10px] text-stone-400">
                  {cloudSyncedAt
                    ? 'محفوظ محلياً وعلى حسابك'
                    : 'محفوظ محلياً — يُزامَن عند تسجيل الدخول'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setOpen(false)
                }}
                className="rounded-md border border-ab-border p-1.5 hover:bg-stone-50"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto p-4">
              <p className="text-[11px] text-stone-500">
                أضف حتى 10 وكلاء على مفتاح Gemini و10 على GLM — غيّر الاسم
                والمهمة لكل واحد (بما فيها الافتراضيون). في وضع{' '}
                <strong>تعاون</strong> يعملون معًا (حتى 8 لكل إرسال)؛ في{' '}
                <strong>منفصل</strong> يرد وكيل واحد. @الجميع أو @all للفريق.
              </p>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const n = Math.min(10, Math.max(1, batchCount))
                    const created = addTeamBatch({
                      scopeId,
                      provider: 'google',
                      count: n,
                    })
                    setNote(
                      `أُضيف ${created.length} وكيل Gemini — وُضع وضع تعاون.`
                    )
                  }}
                  className="rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-[11px]"
                >
                  + فريق Gemini ({batchCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const n = Math.min(10, Math.max(1, batchCount))
                    const created = addTeamBatch({
                      scopeId,
                      provider: 'glm',
                      count: n,
                    })
                    setNote(`أُضيف ${created.length} وكيل GLM — وُضع وضع تعاون.`)
                  }}
                  className="rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-[11px]"
                >
                  + فريق GLM ({batchCount})
                </button>
                <label className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                  العدد
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={batchCount}
                    onChange={(e) =>
                      setBatchCount(Number(e.target.value) || 1)
                    }
                    className="w-12 rounded border border-ab-border px-1 py-0.5 text-center"
                    dir="ltr"
                  />
                </label>
              </div>

              <div>
                <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <Bot className="h-3.5 w-3.5" aria-hidden />
                  {editingId ? 'تعديل وكيل' : 'وكيل واحد'}
                </h4>
                <div className="space-y-2">
                  <input
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="الاسم (مثل: وكيل العقود)"
                    className="w-full rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-xs"
                  />
                  <input
                    value={taskAr}
                    onChange={(e) => setTaskAr(e.target.value)}
                    placeholder="المهمة المعيّنة (مثل: مراجعة البنود القانونية)"
                    className="w-full rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="@slug"
                      dir="ltr"
                      className="min-w-[8rem] flex-1 rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-left text-xs font-mono"
                    />
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs"
                      aria-label="نموذج الوكيل"
                    >
                      {AGENT_MODEL_PRESETS.map((m) => (
                        <option key={m.slug} value={m.slug}>
                          {m.labelAr}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={2}
                    placeholder="تعليمات إضافية (اختياري)…"
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
                        إلغاء
                      </button>
                    )}
                  </div>
                  {note && <p className="text-[11px] text-stone-600">{note}</p>}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-stone-500">
                  في هذه الغرفة ({seated.length})
                </p>
                {seated.length === 0 ? (
                  <p className="rounded-md border border-dashed border-ab-border bg-stone-50 px-3 py-3 text-[11px] text-stone-500">
                    لا وكلاء في المقاعد — أضف من القائمة أدناه أو أنشئ وكيلاً
                    جديداً.
                  </p>
                ) : (
                <ul className="space-y-1.5">
                  {seated.map((agent) => (
                    <li
                      key={agent.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-[12px]"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {agent.nameAr}
                          <span className="ms-1 text-[10px] text-stone-400">
                            {agent.custom ? 'مخصص' : 'افتراضي'} ·{' '}
                            {modelLabel(agent.preferredModel)}
                          </span>
                        </p>
                        {agent.taskAr && (
                          <p className="text-[10px] text-stone-500">
                            مهمة: {agent.taskAr}
                          </p>
                        )}
                        <p
                          className="font-mono text-[10px] text-stone-400"
                          dir="ltr"
                        >
                          @{agent.slug}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(agent)}
                          className="rounded-md border border-ab-border px-2 py-1 text-[10px]"
                        >
                          تعديل
                        </button>
                        {!agent.custom && agentOverrides[agent.id] && (
                          <button
                            type="button"
                            onClick={() => {
                              clearAgentOverride(agent.id)
                              setNote(`أُعيد «${agent.nameAr}» للافتراضي.`)
                              if (editingId === agent.id) resetForm()
                            }}
                            className="rounded-md border border-ab-border px-2 py-1 text-[10px]"
                          >
                            إعادة ضبط
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
                          إزالة
                        </button>
                        {agent.custom && (
                          <button
                            type="button"
                            onClick={() => {
                              deleteCustomAgent(agent.id)
                              setNote(`حُذف «${agent.nameAr}».`)
                              if (editingId === agent.id) resetForm()
                            }}
                            className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-700"
                          >
                            حذف
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                )}
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
                      لا وكلاء إضافيين خارج الغرفة.
                    </li>
                  )}
                </ul>
                <p className="mt-2 text-[10px] text-stone-400">
                  الافتراضيون ({BUILTIN_ROOM_AGENTS.length}) يُخفون أو يُعدَّلون
                  دون حذف. المخصصون يُحذفون نهائيًا إن اخترت ذلك. وكلاء
                  Gemini/GLM يشاركون نفس مفتاح الـ API.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
