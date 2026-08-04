'use client'

import { useEffect } from 'react'
import { Shield, X, Fingerprint, Bot, History } from 'lucide-react'
import type { RoomAgent } from '@/lib/rooms/agents'
import { AGENT_MODEL_PRESETS } from '@/lib/rooms/agents'
import { DEMO_AGENT_PROFILES } from '@/lib/demo/guest-digest'
import { cn } from '@/lib/utils'

function modelCapabilityAr(slug?: string) {
  if (!slug) return 'نموذج الغرفة الافتراضي'
  if (slug.includes('ollama') || slug.includes('local')) {
    return 'خصوصية عالية — محلي على الجهاز'
  }
  if (slug.includes('flash') || slug.includes('mini')) {
    return 'استجابة سريعة — تكلفة أقل'
  }
  if (slug.includes('opus') || slug.includes('pro') || slug.includes('sonnet')) {
    return 'أعلى دقة — تحليل معمق'
  }
  if (slug.includes('glm') || slug.includes('gpt-5.6') || slug.includes('4o')) {
    return 'متوازن — دقة وتكلفة'
  }
  const preset = AGENT_MODEL_PRESETS.find((m) => m.slug === slug)
  return preset?.labelAr || 'قدرة مخصّصة'
}

export function AgentProfileDrawer({
  agent,
  open,
  onClose,
  recentActionsAr = [],
  answering,
}: {
  agent: RoomAgent | null
  open: boolean
  onClose: () => void
  recentActionsAr?: string[]
  answering?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !agent) return null

  const profile = DEMO_AGENT_PROFILES[agent.id] || {
    permissionsAr: [
      'مشاركة في الغرفة المعيّنة',
      'الإجراءات الحساسة عبر موافقة بشرية',
    ],
    capabilitiesAr: agent.taskAr ? [agent.taskAr] : ['مهام الغرفة'],
    modelHintAr: modelCapabilityAr(agent.preferredModel),
    ownerBondAr: 'مربوط بالنطاق الحالي · السجل في تدقيق سدايا',
  }

  const fallbackActions =
    recentActionsAr.length > 0
      ? recentActionsAr
      : [
          'آخر إجراء مسجّل في سجل التدقيق عند التنفيذ',
          answering ? 'يجيب الآن في الغرفة…' : 'جاهز للإشارة بـ @' + agent.slug,
        ]

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`هوية الوكيل ${agent.nameAr}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-ab-border bg-white shadow-xl"
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ab-border px-4 py-3">
          <div className="flex items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: `hsl(${agent.avatarHue} 55% 42%)` }}
            >
              {agent.nameAr.slice(0, 1)}
            </span>
            <div>
              <h3 className="text-base font-bold text-ab-ink">{agent.nameAr}</h3>
              <p className="text-[11px] text-stone-500" dir="ltr">
                @{agent.slug}
              </p>
              {answering && (
                <p className="mt-1 text-[11px] font-medium text-ab-accent">
                  يجيب الآن…
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ab-border p-1.5 hover:bg-stone-50"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4 text-sm">
          <div className="rounded-xl border border-ab-accent/20 bg-ab-accent/5 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ab-accent">
              <Fingerprint className="h-3.5 w-3.5" />
              هوية وربط
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-stone-700">
              {profile.ownerBondAr}
            </p>
            <p className="mt-1 font-mono text-[10px] text-stone-400" dir="ltr">
              agent:{agent.id}
            </p>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
              <Bot className="h-3.5 w-3.5" />
              القدرة / الخصوصية
            </p>
            <p className="rounded-lg border border-ab-border bg-stone-50 px-3 py-2 text-[13px] font-medium text-ab-ink">
              {agent.preferredModel
                ? modelCapabilityAr(agent.preferredModel)
                : profile.modelHintAr}
            </p>
            {agent.preferredModel && (
              <p className="mt-1 text-[10px] text-stone-400" dir="ltr">
                {agent.preferredModel}
              </p>
            )}
          </div>

          {agent.taskAr && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-stone-500">
                المهمة المعيّنة
              </p>
              <p className="text-[13px] text-ab-ink">{agent.taskAr}</p>
            </div>
          )}

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
              <Shield className="h-3.5 w-3.5" />
              الصلاحيات
            </p>
            <ul className="space-y-1">
              {profile.permissionsAr.map((p) => (
                <li
                  key={p}
                  className="rounded-md border border-ab-border/80 bg-white px-2.5 py-1.5 text-[12px] text-stone-700"
                >
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-stone-500">
              القدرات
            </p>
            <div className="flex flex-wrap gap-1.5">
              {profile.capabilitiesAr.map((c) => (
                <span
                  key={c}
                  className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] text-stone-700"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
              <History className="h-3.5 w-3.5" />
              آخر الإجراءات (قابل للتدقيق)
            </p>
            <ul className="space-y-1.5">
              {fallbackActions.map((a, i) => (
                <li
                  key={`${i}-${a}`}
                  className={cn(
                    'text-[12px] leading-snug text-stone-600',
                    i === 0 && answering && 'font-medium text-ab-accent'
                  )}
                >
                  · {a}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                onClose()
                window.dispatchEvent(
                  new CustomEvent('ab-nav', { detail: 'audit' })
                )
              }}
              className="mt-2 text-[11px] font-medium text-ab-accent underline"
            >
              فتح سجل التدقيق الكامل
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
