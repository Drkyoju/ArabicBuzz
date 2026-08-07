'use client'

import { Bot, MessageSquareText, Radio } from 'lucide-react'
import { useAgentRosterStore } from '@/lib/rooms/agent-roster-store'
import { agentsAlwaysPresentInRoom } from '@/lib/rooms/roster-scope'
import { cn } from '@/lib/utils'

/**
 * Master room switch: agents reply with the team, or notes/chat without agent replies.
 * Shared team rooms keep agents continuously present (no humans-only mode).
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
  const alwaysPresent = agentsAlwaysPresentInRoom(scopeId)
  const enabled = useAgentRosterStore(
    (s) =>
      alwaysPresent || s.agentsEnabledByScope[scopeId] !== false
  )
  const setAgentsEnabled = useAgentRosterStore((s) => s.setAgentsEnabled)

  if (alwaysPresent) {
    return (
      <div
        className={cn('inline-flex flex-col items-stretch gap-0.5', className)}
        dir="rtl"
      >
        {!compact && (
          <span className="ab-toolbar-label">الوكلاء في الغرفة</span>
        )}
        <div
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-emerald-200/80 bg-emerald-50/90 px-2 font-medium text-emerald-800',
            compact ? 'py-0.5 text-[10px]' : 'py-1 text-[11px]'
          )}
          role="status"
          title="الوكلاء متاحون — الرسالة توقظ وكيل١ (والباقي نائم حتى الإشارة أو الازدحام)"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <Radio className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          متاحون · نوم افتراضي
        </div>
        {!compact && (
          <p className="text-[10px] leading-snug text-ab-muted">
            أي رسالة توقظ وكيل١ فقط. إن كان يعمل تُوقظ التالية. بعد المهمة يعود للنوم.
          </p>
        )}
      </div>
    )
  }

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
          title="محادثة وملاحظات — بلا ردود من الوكلاء"
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
          محادثة فقط
        </button>
      </div>
      {!compact && (
        <p className="text-[10px] leading-snug text-ab-muted">
          {enabled
            ? 'مفعّل: الوكلاء يردّون هنا — حتى 8 وكيل/مهمة معاً.'
            : 'موقوف: محادثة وملاحظات فقط — بلا ردود وكلاء.'}
        </p>
      )}
    </div>
  )
}
