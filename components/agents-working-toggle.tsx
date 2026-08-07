'use client'

import { Bot, MessageSquareText } from 'lucide-react'
import { useAgentRosterStore } from '@/lib/rooms/agent-roster-store'
import { cn } from '@/lib/utils'

/**
 * Master room switch: agents reply with the team, or humans-only notes/chat.
 */
export function AgentsWorkingToggle({
  scopeId,
  className,
  compact = false,
}: {
  scopeId: string
  className?: string
  compact?: boolean
}) {
  const enabled = useAgentRosterStore(
    (s) => s.agentsEnabledByScope[scopeId] !== false
  )
  const setAgentsEnabled = useAgentRosterStore((s) => s.setAgentsEnabled)

  return (
    <div
      className={cn(
        'inline-flex flex-col items-stretch gap-0.5',
        className
      )}
      dir="rtl"
    >
      <div
        className={cn(
          'inline-flex items-center rounded-md border border-ab-border bg-white p-0.5',
          compact ? 'text-[10px]' : 'text-[11px]'
        )}
        role="group"
        aria-label="الوكلاء يعملون معنا"
      >
        <button
          type="button"
          title="الوكلاء يردّون في الغرفة مع الفريق"
          aria-pressed={enabled}
          onClick={() => setAgentsEnabled(scopeId, true)}
          className={cn(
            'inline-flex items-center gap-1 rounded px-2 py-0.5 transition-colors',
            enabled
              ? 'bg-ab-accent font-semibold text-white'
              : 'text-stone-600 hover:bg-stone-50'
          )}
        >
          <Bot className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          الوكلاء يعملون معنا
        </button>
        <button
          type="button"
          title="محادثة وملاحظات بشرية فقط — بلا ردود من الوكلاء"
          aria-pressed={!enabled}
          onClick={() => setAgentsEnabled(scopeId, false)}
          className={cn(
            'inline-flex items-center gap-1 rounded px-2 py-0.5 transition-colors',
            !enabled
              ? 'bg-ab-ink font-semibold text-white'
              : 'text-stone-600 hover:bg-stone-50'
          )}
        >
          <MessageSquareText
            className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')}
          />
          بشر فقط
        </button>
      </div>
      {!compact && (
        <p className="text-[10px] leading-snug text-stone-500">
          {enabled
            ? 'مفعّل: الوكلاء يردّون هنا — نفس المقاعد لكل الموظفين، حتى 8 وكيل/مهمة معاً.'
            : 'موقوف: محادثة وملاحظات الفريق فقط — بلا ردود وكلاء.'}
        </p>
      )}
    </div>
  )
}
