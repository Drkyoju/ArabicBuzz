'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, Plus, Trash2, X } from 'lucide-react'
import {
  agentModelLabelAr,
  agentModelOptionLabelAr,
  BUILTIN_ROOM_AGENTS,
  roomAgentModelCatalog,
  type RoomAgent,
} from '@/lib/rooms/agents'
import {
  agentRenameHintAr,
  defaultSeatNameAr,
  sharedAgentNamesAreFixed,
} from '@/lib/rooms/agent-names'
import { useAgentRosterStore } from '@/lib/rooms/agent-roster-store'
import { useWorkspaceModeStore } from '@/lib/scopes/workspace-mode-store'
import {
  RUN_EFFORT_HINTS_AR,
  RUN_EFFORT_LABELS_AR,
  RUN_EFFORT_ORDER,
  parseRunEffort,
  type RunEffort,
} from '@/lib/ai/run-effort'
import { cn } from '@/lib/utils'

const MODEL_OPTIONS = roomAgentModelCatalog()
const DEFAULT_MODEL: string = MODEL_OPTIONS[0]?.slug || 'gemini-3.1-pro'

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
  const cloudSyncedAt = useAgentRosterStore((s) => s.cloudSyncedAt)
  const canAccessOpsUi = useWorkspaceModeStore((s) => s.canAccessOpsUi)
  const sharedFixed = sharedAgentNamesAreFixed(scopeId)
  /** Personal: anyone. Shared team room: workspace owner only. */
  const canRename = !sharedFixed || canAccessOpsUi
  const renameHint = agentRenameHintAr(scopeId, canRename)

  const [open, setOpen] = useState(false)
  const [nameAr, setNameAr] = useState('')
  const [slug, setSlug] = useState('')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [effort, setEffort] = useState<RunEffort>('MEDIUM')
  const [batchModel, setBatchModel] = useState(DEFAULT_MODEL)
  const [batchEffort, setBatchEffort] = useState<RunEffort>('MEDIUM')
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
    setPrompt('')
    setModel(DEFAULT_MODEL)
    setEffort('MEDIUM')
    setEditingId(null)
  }

  function startEdit(agent: RoomAgent) {
    setEditingId(agent.id)
    setNameAr(agent.nameAr)
    setSlug(agent.slug)
    setPrompt(agent.systemPromptAr)
    setModel(agent.preferredModel || DEFAULT_MODEL)
    setEffort(parseRunEffort(agent.preferredEffort))
    setOpen(true)
  }

  function save() {
    setNote('')
    if (!nameAr.trim()) {
      setNote('أدخل اسم الوكيل.')
      return
    }
    if (editingId) {
      if (!canRename) {
        updateAgent(editingId, {
          systemPromptAr: prompt,
          preferredModel: model,
          preferredEffort: effort,
        })
        setNote('تم تحديث النموذج والقوة. الاسم ثابت — يحدّده المدير فقط.')
      } else {
        updateAgent(editingId, {
          nameAr,
          slug: slug || undefined,
          systemPromptAr: prompt,
          preferredModel: model,
          preferredEffort: effort,
        })
        setNote(
          sharedFixed
            ? 'تم تحديث الوكيل — الاسم يظهر لكل موظفي غرفة الفريق.'
            : 'تم تحديث الوكيل (اسمك الخاص في مساحتك الشخصية).'
        )
      }
    } else {
      if (!canRename && sharedFixed) {
        setNote('إضافة وكلاء بأسماء جديدة في غرفة الفريق للمدير فقط.')
        return
      }
      const agent = addCustomAgent({
        nameAr: nameAr.trim() || defaultSeatNameAr(seated.length + 1),
        slug: slug || undefined,
        systemPromptAr: prompt,
        preferredModel: model,
        preferredEffort: effort,
        scopeId,
      })
      setNote(
        `أُضيف «${agent.nameAr}» (@${agent.slug}) · ${agentModelLabelAr(model)} · قوة ${RUN_EFFORT_LABELS_AR[effort]}`
      )
    }
    resetForm()
  }

  function addBatch() {
    const n = Math.min(10, Math.max(1, batchCount))
    const created = addTeamBatch({
      scopeId,
      preferredModel: batchModel,
      preferredEffort: batchEffort,
      count: n,
    })
    setNote(
      `أُضيف ${created.length} مقعد · ${agentModelLabelAr(batchModel)} · قوة ${RUN_EFFORT_LABELS_AR[batchEffort]} — وُضع وضع تعاون.`
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
          className="ab-btn-secondary !py-0.5 text-[11px]"
        >
          <Plus className="h-3 w-3" />
          {sharedFixed && canRename
            ? 'أسماء الوكلاء (مدير)'
            : 'إدارة الوكلاء'}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="إدارة الوكلاء"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="relative z-[71] flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ab-border bg-ab-surface shadow-xl sm:max-h-[90dvh]">
            <div className="flex items-center justify-between border-b border-ab-border px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-ab-ink">إدارة الوكلاء</h3>
                <p className="text-[10px] text-stone-400">
                  {cloudSyncedAt
                    ? sharedFixed
                      ? 'محفوظ للغرفة — كل الموظفين يشاركون نفس الأسماء'
                      : 'محفوظ في مساحتك الشخصية'
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
              <p className="rounded-md border border-ab-accent/20 bg-ab-accent/5 px-2.5 py-2 text-[11px] leading-snug text-stone-600">
                {renameHint}
                {' · '}
                الافتراضي: وكيل١، وكيل٢… · المهمة تُحدَّد لاحقاً عبر @mention.
              </p>
              <p className="text-[11px] text-stone-500">
                حتى 8 وكيل معاً (سقف Netlify 20) · تعاون = عدة وكلاء · منفصل =
                واحد · @الجميع للفريق.
              </p>

              {(canRename || !sharedFixed) && (
                <div className="space-y-2 rounded-lg border border-ab-border bg-stone-50/80 p-2.5">
                  <p className="text-[11px] font-semibold text-stone-600">
                    إضافة بعدد (نفس النموذج والقوة)
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex min-w-[10rem] flex-1 flex-col gap-0.5 text-[10px] text-stone-500">
                      النموذج
                      <select
                        value={batchModel}
                        onChange={(e) => setBatchModel(e.target.value)}
                        className="rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs"
                        aria-label="نموذج الدفعة"
                      >
                        {MODEL_OPTIONS.map((m) => (
                          <option key={m.slug} value={m.slug}>
                            {agentModelOptionLabelAr(m)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-w-[7rem] flex-col gap-0.5 text-[10px] text-stone-500">
                      القوة
                      <select
                        value={batchEffort}
                        onChange={(e) =>
                          setBatchEffort(parseRunEffort(e.target.value))
                        }
                        className="rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs"
                        aria-label="قوة الدفعة"
                        title={RUN_EFFORT_HINTS_AR[batchEffort]}
                      >
                        {RUN_EFFORT_ORDER.map((level) => (
                          <option key={level} value={level}>
                            {RUN_EFFORT_LABELS_AR[level]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inline-flex flex-col gap-0.5 text-[10px] text-stone-500">
                      العدد
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={batchCount}
                        onChange={(e) =>
                          setBatchCount(Number(e.target.value) || 1)
                        }
                        className="w-14 rounded-md border border-ab-border bg-white px-1 py-1.5 text-center text-xs"
                        dir="ltr"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={addBatch}
                      className="rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-stone-50"
                    >
                      + إضافة {batchCount}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <Bot className="h-3.5 w-3.5" aria-hidden />
                  {editingId
                    ? canRename
                      ? 'تعديل وكيل / إعادة تسمية'
                      : 'تعديل نموذج وقوة الوكيل'
                    : 'وكيل واحد'}
                </h4>
                <p className="mb-2 text-[10px] text-stone-500">
                  يكفي الاسم — الطلبات تصل لاحقاً عبر الإشارة (@). اختر النموذج
                  والقوة لكل مقعد.
                </p>
                <div className="space-y-2">
                  <label className="flex flex-col gap-0.5 text-[10px] text-stone-500">
                    الاسم
                    <input
                      value={nameAr}
                      onChange={(e) => setNameAr(e.target.value)}
                      placeholder={`مثل: ${defaultSeatNameAr(seated.length + 1)}`}
                      disabled={Boolean(editingId) && !canRename}
                      className="w-full rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-xs disabled:bg-stone-50 disabled:text-stone-500"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex min-w-[8rem] flex-1 flex-col gap-0.5 text-[10px] text-stone-500">
                      @slug (اختياري)
                      <input
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="@slug"
                        dir="ltr"
                        disabled={Boolean(editingId) && !canRename}
                        className="w-full rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-left text-xs font-mono disabled:bg-stone-50"
                      />
                    </label>
                    <label className="flex min-w-[10rem] flex-[1.4] flex-col gap-0.5 text-[10px] text-stone-500">
                      النموذج
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs"
                        aria-label="نموذج الوكيل"
                      >
                        {MODEL_OPTIONS.map((m) => (
                          <option key={m.slug} value={m.slug}>
                            {agentModelOptionLabelAr(m)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-w-[7rem] flex-col gap-0.5 text-[10px] text-stone-500">
                      القوة
                      <select
                        value={effort}
                        onChange={(e) =>
                          setEffort(parseRunEffort(e.target.value))
                        }
                        className="rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs"
                        aria-label="قوة الوكيل"
                        title={RUN_EFFORT_HINTS_AR[effort]}
                      >
                        {RUN_EFFORT_ORDER.map((level) => (
                          <option key={level} value={level}>
                            {RUN_EFFORT_LABELS_AR[level]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="flex flex-col gap-0.5 text-[10px] text-stone-500">
                    تعليمات إضافية (اختياري)
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={2}
                      placeholder="أسلوب الرد أو قيود دائمة لهذا المقعد…"
                      className="w-full rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-xs"
                    />
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={save}
                      className="rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      {editingId
                        ? canRename
                          ? 'حفظ التعديل'
                          : 'حفظ النموذج والقوة'
                        : 'إضافة للغرفة'}
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
                    لا وكلاء في المقاعد — أضف وكيلاً واحداً أو دفعة أعلاه.
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
                              {agentModelLabelAr(agent.preferredModel)} · قوة{' '}
                              {
                                RUN_EFFORT_LABELS_AR[
                                  parseRunEffort(agent.preferredEffort)
                                ]
                              }
                            </span>
                          </p>
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
                            {canRename ? 'تعديل / إعادة تسمية' : 'نموذج/قوة'}
                          </button>
                          {canRename &&
                            !agent.custom &&
                            agentOverrides[agent.id] && (
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
                          {(canRename || !sharedFixed) && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  !confirm(
                                    `إزالة «${agent.nameAr}» من هذه الغرفة؟`
                                  )
                                ) {
                                  return
                                }
                                removeAgentFromScope(scopeId, agent.id)
                                setNote(`أُزيل «${agent.nameAr}» من هذه الغرفة.`)
                              }}
                              className="rounded-md border border-ab-border px-2 py-1 text-[10px] text-red-700"
                            >
                              إزالة
                            </button>
                          )}
                          {canRename && agent.custom && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  !confirm(
                                    `حذف الوكيل المخصص «${agent.nameAr}» نهائياً؟`
                                  )
                                ) {
                                  return
                                }
                                deleteCustomAgent(agent.id)
                                setNote(`حُذف «${agent.nameAr}».`)
                              }}
                              className="rounded-md border border-red-200 px-2 py-1 text-[10px] text-red-700"
                              aria-label="حذف"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(canRename || !sharedFixed) && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-stone-500">
                    إضافة من الكتالوج
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {catalog
                      .filter((a) => !seatedIds.has(a.id))
                      .map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => {
                            addAgentToScope(scopeId, agent.id)
                            setNote(`أُضيف «${agent.nameAr}» للغرفة.`)
                          }}
                          className="rounded-md border border-dashed border-ab-border bg-stone-50 px-2 py-1 text-[10px] hover:bg-white"
                        >
                          + {agent.nameAr}
                        </button>
                      ))}
                    {BUILTIN_ROOM_AGENTS.every((a) => seatedIds.has(a.id)) &&
                      catalog.every((a) => seatedIds.has(a.id)) && (
                        <p className="text-[10px] text-stone-400">
                          كل الوكلاء في المقاعد.
                        </p>
                      )}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-stone-400">
                وضع التعاون:{' '}
                {collabMode === 'team' ? 'فريق (عدة وكلاء)' : 'منفصل'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
