'use client'

import { useMemo } from 'react'
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
  answeringAgentId,
  onSeatClick,
  className,
}: {
  scopeId: string
  activeAgentId?: string | null
  /** Agent currently streaming a reply */
  answeringAgentId?: string | null
  onSeatClick?: (agent: RoomAgent) => void
  className?: string
}) {
  // Select stable slices — never return a fresh array from the selector
  // (causes getServerSnapshot infinite loop in production).
  const agentsForScope = useAgentRosterStore((s) => s.agentsForScope)
  const customAgents = useAgentRosterStore((s) => s.customAgents)
  const removedFromScope = useAgentRosterStore((s) => s.removedFromScope)
  const addedToScope = useAgentRosterStore((s) => s.addedToScope)
  const agentOverrides = useAgentRosterStore((s) => s.agentOverrides)
  const collabMode = useAgentRosterStore(
    (s) => s.collabModeByScope[scopeId] || 'solo'
  )
  const agents = useMemo(
    () => agentsForScope(scopeId),
    [
      agentsForScope,
      scopeId,
      customAgents,
      removedFromScope,
      addedToScope,
      agentOverrides,
    ]
  )

  return (
    <div className={cn('space-y-1', className)} dir="rtl">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-medium text-stone-400">وكلاء</span>
        {agents.map((agent) => {
          const active = activeAgentId === agent.id
          const answering = answeringAgentId === agent.id
          const model = shortModel(agent.preferredModel)
          const tip = [
            `@${agent.slug}`,
            agent.taskAr ? `مهمة: ${agent.taskAr}` : null,
            agent.preferredModel || null,
            collabMode === 'team' ? 'وضع تعاون' : 'وضع منفصل',
            answering ? 'يجيب الآن…' : null,
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
                'inline-flex max-w-[14rem] items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                answering
                  ? 'border-ab-accent bg-ab-accent/15 font-semibold text-ab-accent ring-1 ring-ab-accent/30'
                  : active
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
              {answering ? (
                <span className="shrink-0 text-[9px] text-ab-accent">يجيب…</span>
              ) : model ? (
                <span className="shrink-0 text-[9px] text-stone-400" dir="ltr">
                  {model}
                </span>
              ) : null}
            </button>
          )
        })}
        <AgentsManagePanel scopeId={scopeId} compact />
      </div>
      {agents.some((a) => a.taskAr) && (
        <p className="truncate text-[10px] text-stone-400">
          مهام:{' '}
          {agents
            .filter((a) => a.taskAr)
            .map((a) => `${a.nameAr}: ${a.taskAr}`)
            .join(' · ')}
        </p>
      )}
    </div>
  )
}
