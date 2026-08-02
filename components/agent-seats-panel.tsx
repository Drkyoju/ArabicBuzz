'use client'

import {
  AGENT_MODEL_PRESETS,
  type RoomAgent,
} from '@/lib/rooms/agents'
import { useAgentRosterStore } from '@/lib/rooms/agent-roster-store'
import { AgentsManagePanel } from '@/components/agents-manage-panel'
import { cn } from '@/lib/utils'

function shortModel(slug?: string) {
  if (!slug) return ''
  const preset = AGENT_MODEL_PRESETS.find((m) => m.slug === slug)
  if (preset?.provider === 'glm') return 'GLM'
  if (preset?.provider === 'google') return 'Gemini'
  if (slug.includes('glm')) return 'GLM'
  if (slug.includes('gemini')) return 'Gemini'
  return slug.slice(0, 8)
}

export function AgentSeatsPanel({
  scopeId,
  activeAgentId,
  onSeatClick,
  className,
}: {
  scopeId: string
  activeAgentId?: string | null
  onSeatClick?: (agent: RoomAgent) => void
  className?: string
}) {
  const agents = useAgentRosterStore((s) => s.agentsForScope(scopeId))
  const collabMode = useAgentRosterStore((s) => s.collabModeFor(scopeId))

  return (
    <div className={cn('space-y-1', className)} dir="rtl">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-medium text-stone-400">وكلاء</span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px]',
            collabMode === 'team'
              ? 'bg-ab-accent/15 text-ab-accent'
              : 'bg-stone-100 text-stone-500'
          )}
          title={
            collabMode === 'team'
              ? 'بدون @mention يعمل حتى 8 وكلاء بالتتابع ويتبادلون الملاحظات'
              : 'يرد وكيل واحد (أول المقعد أو @الاسم) — @الجميع لتشغيل الفريق'
          }
        >
          {collabMode === 'team' ? 'تعاون' : 'منفصل'}
        </span>
        {agents.map((agent) => {
          const active = activeAgentId === agent.id
          const model = shortModel(agent.preferredModel)
          const tip = [
            `@${agent.slug}`,
            agent.taskAr ? `مهمة: ${agent.taskAr}` : null,
            agent.preferredModel || null,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <button
              key={agent.id}
              type="button"
              title={tip}
              onClick={() => onSeatClick?.(agent)}
              className={cn(
                'inline-flex max-w-[12rem] items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                active
                  ? 'border-ab-accent bg-ab-accent/10 font-medium text-ab-accent'
                  : 'border-transparent bg-stone-100 text-ab-ink hover:bg-stone-200/80'
              )}
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
                style={{ backgroundColor: `hsl(${agent.avatarHue} 55% 42%)` }}
                aria-hidden
              >
                {agent.nameAr.slice(0, 1)}
              </span>
              <span className="truncate">{agent.nameAr}</span>
              {model ? (
                <span className="shrink-0 text-[9px] text-stone-400" dir="ltr">
                  {model}
                </span>
              ) : null}
            </button>
          )
        })}
        <AgentsManagePanel scopeId={scopeId} compact />
      </div>
    </div>
  )
}
