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

  return (
    <div className={cn('space-y-2', className)} dir="rtl">
      <p className="text-[11px] font-semibold text-stone-500">مقاعد الوكلاء</p>
      <ul className="flex flex-wrap gap-2">
        {agents.map((agent) => {
          const active = activeAgentId === agent.id
          return (
            <li key={agent.id}>
              <button
                type="button"
                onClick={() => onSeatClick?.(agent)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2 py-1.5 text-right transition-colors',
                  active
                    ? 'border-ab-accent bg-ab-accent/10'
                    : 'border-ab-border bg-white hover:bg-stone-50'
                )}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: `hsl(${agent.avatarHue} 55% 42%)` }}
                  aria-hidden
                >
                  {agent.nameAr.slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-ab-ink">
                    {agent.nameAr}
                  </span>
                  <span className="block text-[10px] text-stone-500" dir="ltr">
                    @{agent.slug}
                    {active ? ' · نشط' : ' · مقعد'}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
