'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  agentModelLabelAr,
  type RoomAgent,
} from '@/lib/rooms/agents'
import { useAgentRosterStore } from '@/lib/rooms/agent-roster-store'
import { AgentsManagePanel } from '@/components/agents-manage-panel'
import { AgentProfileDrawer } from '@/components/agent-profile-drawer'
import { CollabModeToggle } from '@/components/collab-mode-toggle'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { RUN_EFFORT_LABELS_AR, parseRunEffort } from '@/lib/ai/run-effort'
import { cn } from '@/lib/utils'

function shortCapability(slug?: string) {
  if (!slug) return ''
  const label = agentModelLabelAr(slug)
  return label.split('·')[0]?.trim() || label
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
  /** Optional: after power toggle (e.g. status toast). */
  onSeatClick?: (agent: RoomAgent, online: boolean) => void
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
  const agentsEnabled = useAgentRosterStore((s) =>
    s.agentsEnabledFor(scopeId)
  )
  const agentOnlineByScope = useAgentRosterStore((s) => s.agentOnlineByScope)
  const toggleAgentOnline = useAgentRosterStore((s) => s.toggleAgentOnline)
  const isAgentOnline = useAgentRosterStore((s) => s.isAgentOnline)
  const [profileAgent, setProfileAgent] = useState<RoomAgent | null>(null)
  const signedIn = useSignedIn()
  const [liveActions, setLiveActions] = useState<string[]>([])

  useEffect(() => {
    if (signedIn === false) {
      setLiveActions([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/rooms/home?scopeId=${encodeURIComponent(scopeId)}`,
          { headers: await authHeaders() }
        )
        if (!res.ok || cancelled) return
        const json = (await res.json()) as {
          activity?: Array<{
            actorAr: string
            actionAr: string
            detailAr?: string | null
            kind: string
          }>
          recentPosts?: Array<{
            authorAr: string
            content: string
            kind: string
          }>
        }
        const fromActivity = (json.activity || [])
          .filter((a) => a.kind === 'agent' || a.kind === 'hitl')
          .map((a) => `${a.actionAr}${a.detailAr ? ` — ${a.detailAr}` : ''}`)
        const fromPosts = (json.recentPosts || [])
          .filter((p) => p.kind === 'agent')
          .map((p) => `${p.authorAr}: ${p.content}`)
        if (!cancelled) {
          setLiveActions([...fromActivity, ...fromPosts].slice(0, 8))
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scopeId, signedIn, answeringAgentId])

  const recentPool = signedIn && liveActions.length > 0 ? liveActions : []
  // Subscribe so seats re-render on toggle
  void agentOnlineByScope

  return (
    <div className={cn('space-y-1', className)} dir="rtl">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          متواجدون ٢٤س
          {agents.length > 0 ? (
            <span className="text-stone-400">· {agents.length}</span>
          ) : null}
        </span>
        {agents.map((agent) => {
          const online =
            agentsEnabled && isAgentOnline(scopeId, agent.id)
          const active = activeAgentId === agent.id
          const answering = answeringAgentId === agent.id
          const model = shortCapability(agent.preferredModel)
          const power =
            RUN_EFFORT_LABELS_AR[parseRunEffort(agent.preferredEffort)]
          const statusAr = !agentsEnabled
            ? 'طافي'
            : !online
              ? 'طافي'
              : answering
                ? 'يعمل'
                : 'شغال'
          const tip = [
            online
              ? 'اضغط لإيقاف الوكيل (طافي)'
              : 'اضغط لتشغيل الوكيل (شغال)',
            'نقرة مزدوجة للإعدادات',
            model ? `نموذج: ${model}` : null,
            `قوة: ${power}`,
            collabMode === 'team' ? 'وضع تعاون' : 'وضع منفصل',
            statusAr,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <button
              key={agent.id}
              type="button"
              title={tip}
              aria-pressed={online}
              aria-label={`${agent.nameAr} — ${statusAr}`}
              onClick={() => {
                if (!agentsEnabled) return
                const next = toggleAgentOnline(scopeId, agent.id)
                onSeatClick?.(agent, next)
              }}
              onDoubleClick={(e) => {
                e.preventDefault()
                setProfileAgent(agent)
              }}
              className={cn(
                'inline-flex max-w-[14rem] items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                !online
                  ? 'border-stone-200 bg-stone-50 text-stone-400'
                  : answering
                    ? 'border-ab-accent bg-ab-accent/15 font-semibold text-ab-accent ring-1 ring-ab-accent/30'
                    : active
                      ? 'border-ab-accent bg-ab-accent/10 font-medium text-ab-accent'
                      : 'border-emerald-100 bg-emerald-50/70 text-ab-ink hover:bg-emerald-50'
              )}
            >
              <span className="relative shrink-0">
                <span
                  className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-white"
                  style={{
                    backgroundColor: `hsl(${agent.avatarHue} 55% 42%)`,
                    opacity: online ? 1 : 0.45,
                  }}
                  aria-hidden
                >
                  {agent.nameAr.slice(0, 1)}
                </span>
                <span
                  className={cn(
                    'absolute -bottom-0.5 -start-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-white',
                    !online
                      ? 'bg-stone-400'
                      : answering
                        ? 'bg-ab-accent'
                        : 'bg-emerald-500'
                  )}
                  aria-hidden
                />
              </span>
              <span className={cn('truncate', !online && 'line-through')}>
                {agent.nameAr}
              </span>
              <span
                className={cn(
                  'shrink-0 text-[9px]',
                  !online && 'text-stone-400',
                  online && answering && 'text-ab-accent',
                  online && !answering && 'text-emerald-600'
                )}
              >
                {statusAr}
                {online && !answering && model ? ` · ${model}` : ''}
              </span>
            </button>
          )
        })}
        <AgentsManagePanel scopeId={scopeId} compact />
        <CollabModeToggle scopeId={scopeId} />
      </div>
      {answeringAgentId && (
        <p className="text-[10px] font-medium text-ab-accent">
          {agents.find((a) => a.id === answeringAgentId)?.nameAr || 'وكيل'}{' '}
          يعمل الآن…
        </p>
      )}
      {!answeringAgentId && agents.length > 0 && (
        <p className="truncate text-[10px] text-stone-400">
          اضغط المقعد: شغال ↔ طافي · كل رسالة يطّلع عليها وكيل جاهز فوراً ·{' '}
          {collabMode === 'team' ? 'تعاون نشط' : 'منفصل'}
        </p>
      )}

      <AgentProfileDrawer
        agent={profileAgent}
        open={Boolean(profileAgent)}
        onClose={() => setProfileAgent(null)}
        scopeId={scopeId}
        answering={
          profileAgent ? answeringAgentId === profileAgent.id : false
        }
        recentActionsAr={
          profileAgent
            ? recentPool
                .filter((line) =>
                  profileAgent.nameAr
                    ? line.includes(profileAgent.nameAr) ||
                      line.includes(profileAgent.slug)
                    : true
                )
                .slice(0, 3)
                .concat(
                  recentPool
                    .filter(
                      (line) =>
                        !profileAgent.nameAr ||
                        (!line.includes(profileAgent.nameAr) &&
                          !line.includes(profileAgent.slug))
                    )
                    .slice(0, 3)
                )
                .slice(0, 3)
            : []
        }
      />
    </div>
  )
}
