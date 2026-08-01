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
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} dir="rtl">
      <span className="text-[10px] font-medium text-stone-400">وكلاء</span>
      {agents.map((agent) => {
        const active = activeAgentId === agent.id
        return (
          <button
            key={agent.id}
            type="button"
            onClick={() => onSeatClick?.(agent)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition-colors',
              active
                ? 'border-ab-accent bg-ab-accent/10 text-ab-accent'
                : 'border-ab-border bg-white text-ab-ink hover:bg-stone-50'
            )}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ backgroundColor: `hsl(${agent.avatarHue} 55% 42%)` }}
              aria-hidden
            >
              {agent.nameAr.slice(0, 1)}
            </span>
            <span className="font-medium">{agent.nameAr}</span>
            <span className="text-stone-400" dir="ltr">
              @{agent.slug}
            </span>
          </button>
        )
      })}
    </div>
  )
}
