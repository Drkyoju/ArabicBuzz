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
      className={cn('inline-flex flex-col items-stretch gap-0.5', className)}
      dir="rtl"
    >
      {!compact && (
        <span className="ab-toolbar-label">وضع الغرفة</span>
      )}
      <div
        className={cn('ab-seg', compact ? 'text-[10px]' : 'text-[11px]')}
        role="group"
        aria-label="الوكلاء يعملون معنا"
      >
        <button
          type="button"
          title="الوكلاء يردّون في الغرفة مع الفريق"
          aria-pressed={enabled}
          onClick={() => setAgentsEnabled(scopeId, true)}
          className={cn(
            'ab-seg-item inline-flex items-center gap-1',
            compact ? 'px-1.5 py-0.5' : 'px-2 py-1'
          )}
        >
          <Bot className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          الوكلاء معنا
        </button>
        <button
          type="button"
          title="محادثة وملاحظات بشرية فقط — بلا ردود من الوكلاء"
          aria-pressed={!enabled}
          onClick={() => setAgentsEnabled(scopeId, false)}
          className={cn(
            'ab-seg-item inline-flex items-center gap-1',
            !enabled &&
              '!bg-ab-ink !text-white hover:!bg-ab-ink/90',
            compact ? 'px-1.5 py-0.5' : 'px-2 py-1'
          )}
        >
          <MessageSquareText
            className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')}
          />
          بشر فقط
        </button>
      </div>
      {!compact && (
        <p className="text-[10px] leading-snug text-ab-muted">
          {enabled
            ? 'مفعّل: الوكلاء يردّون هنا — حتى 8 وكيل/مهمة معاً.'
            : 'موقوف: محادثة وملاحظات الفريق فقط — بلا ردود وكلاء.'}
        </p>
      )}
    </div>
  )
}
