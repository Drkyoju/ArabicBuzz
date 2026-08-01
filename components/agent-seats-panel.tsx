'use client'

import { agentsForScope, type RoomAgent } from '@/lib/rooms/agents'
import { cn } from '@/lib/utils'

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
  const agents = agentsForScope(scopeId)
  if (agents.length === 0) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)} dir="rtl">
      <span className="text-[10px] font-medium text-stone-400">وكلاء</span>
      {agents.map((agent) => {
        const active = activeAgentId === agent.id
        return (
          <button
            key={agent.id}
            type="button"
            title={`@${agent.slug}`}
            onClick={() => onSeatClick?.(agent)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition-colors',
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
            <span>{agent.nameAr}</span>
          </button>
        )
      })}
    </div>
  )
}
