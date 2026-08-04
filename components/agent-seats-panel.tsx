'use client'

import { useMemo, useState } from 'react'
import {
  AGENT_MODEL_PRESETS,
  type RoomAgent,
} from '@/lib/rooms/agents'
import { useAgentRosterStore } from '@/lib/rooms/agent-roster-store'
import { AgentsManagePanel } from '@/components/agents-manage-panel'
import { AgentProfileDrawer } from '@/components/agent-profile-drawer'
import { CollabModeToggle } from '@/components/collab-mode-toggle'
import { buildGuestDemoDigest } from '@/lib/demo/guest-digest'
import { cn } from '@/lib/utils'

function shortCapability(slug?: string) {
  if (!slug) return ''
  const preset = AGENT_MODEL_PRESETS.find((m) => m.slug === slug)
  if (preset) return preset.labelAr.split('·')[0]?.trim() || preset.labelAr
  if (slug.includes('flash') || slug.includes('mini')) return 'سريع'
  if (slug.includes('ollama')) return 'محلي'
  return 'دقة'
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
  const agentsForScope = useAgentRosterStore((s) => s.agentsForScope)
  const collabMode = useAgentRosterStore(
    (s) => s.collabModeByScope[scopeId] || 'solo'
  )
  const agents = useMemo(
    () => agentsForScope(scopeId),
    [agentsForScope, scopeId]
  )
  const [profileAgent, setProfileAgent] = useState<RoomAgent | null>(null)

  const demoActions = useMemo(() => {
    const dig = buildGuestDemoDigest()
    return dig.activity
      .filter((a) => a.kind === 'agent' || a.kind === 'hitl')
      .map((a) => `${a.actionAr}${a.detailAr ? ` — ${a.detailAr}` : ''}`)
  }, [])

  return (
    <div className={cn('space-y-1', className)} dir="rtl">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-medium text-stone-400">وكلاء</span>
        {agents.map((agent) => {
          const active = activeAgentId === agent.id
          const answering = answeringAgentId === agent.id
          const model = shortCapability(agent.preferredModel)
          const tip = [
            `اضغط للهوية والصلاحيات`,
            `@${agent.slug}`,
            agent.taskAr ? `مهمة: ${agent.taskAr}` : null,
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
              onClick={() => {
                setProfileAgent(agent)
                onSeatClick?.(agent)
              }}
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
                <span className="shrink-0 text-[9px] text-stone-400">{model}</span>
              ) : null}
            </button>
          )
        })}
        <AgentsManagePanel scopeId={scopeId} compact />
        <CollabModeToggle scopeId={scopeId} />
      </div>
      {answeringAgentId && (
        <p className="text-[10px] font-medium text-ab-accent">
          {agents.find((a) => a.id === answeringAgentId)?.nameAr || 'وكيل'}{' '}
          يكتب الآن…
        </p>
      )}
      {!answeringAgentId && agents.length > 0 && (
        <p className="truncate text-[10px] text-stone-400">
          اضغط مقعد وكيل لرؤية الهوية والصلاحيات وسجل التدقيق ·{' '}
          {collabMode === 'team' ? 'وضع تعاون نشط' : 'وضع منفصل نشط'}
        </p>
      )}
      {agents.some((a) => a.taskAr) && (
        <p className="truncate text-[10px] text-stone-400">
          مهام:{' '}
          {agents
            .filter((a) => a.taskAr)
            .map((a) => `${a.nameAr}: ${a.taskAr}`)
            .join(' · ')}
        </p>
      )}

      <AgentProfileDrawer
        agent={profileAgent}
        open={Boolean(profileAgent)}
        onClose={() => setProfileAgent(null)}
        answering={
          profileAgent ? answeringAgentId === profileAgent.id : false
        }
        recentActionsAr={
          profileAgent
            ? demoActions.filter((_, i) =>
                profileAgent.nameAr.includes('امتثال')
                  ? i === 1 || i === 0
                  : true
              ).slice(0, 3)
            : []
        }
      />
    </div>
  )
}
