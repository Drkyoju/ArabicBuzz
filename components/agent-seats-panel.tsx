'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  agentModelLabelAr,
  ROOM_AGENT_DEFAULT_MODEL,
  ROOM_AGENT_IDEAL_SEATS,
  ROOM_AGENT_SOFT_CAP,
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
  const [pressTip, setPressTip] = useState<string | null>(null)
  const longPressRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    tip: string
  }>({ timer: null, tip: '' })

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
      {agents.length > ROOM_AGENT_SOFT_CAP && (
        <p className="rounded-md border border-amber-200/80 bg-amber-50/90 px-2 py-1 text-[10px] leading-snug text-amber-950">
          مقاعد كثيرة ({agents.length}) — افتح «إدارة الوكلاء» وقلّم إلى ≈
          {ROOM_AGENT_IDEAL_SEATS} لشريط أوضح.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-800/90">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          {agents.length > 0 ? `${agents.length} مقاعد` : 'وكلاء'}
        </span>
        {agents.map((agent) => {
          const online =
            agentsEnabled && isAgentOnline(scopeId, agent.id)
          const active = activeAgentId === agent.id
          const answering = answeringAgentId === agent.id
          const model = shortCapability(
            agent.preferredModel || ROOM_AGENT_DEFAULT_MODEL
          )
          const power =
            RUN_EFFORT_LABELS_AR[parseRunEffort(agent.preferredEffort)]
          const statusAr = !agentsEnabled
            ? 'نائم'
            : !online
              ? 'نائم'
              : answering
                ? 'يعمل'
                : 'شغال'
          const tip = [agent.nameAr, model || 'Gemini Flash', `قوة ${power}`]
            .filter(Boolean)
            .join(' · ')
          const clearLongPress = () => {
            if (longPressRef.current.timer) {
              clearTimeout(longPressRef.current.timer)
              longPressRef.current.timer = null
            }
          }
          return (
            <button
              key={agent.id}
              type="button"
              title={`${tip} — ${statusAr} (اضغط لإيقاظ/تنويم)`}
              aria-pressed={online}
              aria-label={`${tip} — ${statusAr}`}
              onClick={() => {
                if (!agentsEnabled) return
                const next = toggleAgentOnline(scopeId, agent.id)
                onSeatClick?.(agent, next)
              }}
              onDoubleClick={(e) => {
                e.preventDefault()
                setProfileAgent(agent)
              }}
              onTouchStart={() => {
                longPressRef.current.tip = tip
                clearLongPress()
                longPressRef.current.timer = setTimeout(() => {
                  setPressTip(longPressRef.current.tip)
                  window.setTimeout(() => setPressTip(null), 2200)
                }, 480)
              }}
              onTouchEnd={clearLongPress}
              onTouchCancel={clearLongPress}
              onTouchMove={clearLongPress}
              className={cn(
                'inline-flex max-w-[11rem] items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors',
                !online
                  ? 'border-stone-200/80 bg-stone-50/80 text-stone-400'
                  : answering
                    ? 'border-ab-accent/50 bg-ab-accent/10 font-semibold text-ab-accent'
                    : active
                      ? 'border-ab-accent/40 bg-ab-accent/5 font-medium text-ab-accent'
                      : 'border-transparent bg-transparent text-ab-ink hover:bg-stone-100/80'
              )}
            >
              <span className="relative shrink-0">
                <span
                  className="flex h-3.5 w-3.5 items-center justify-center rounded text-[8px] font-bold text-white"
                  style={{
                    backgroundColor: `hsl(${agent.avatarHue} 48% 40%)`,
                    opacity: online ? 1 : 0.4,
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
              {answering ? (
                <span className="shrink-0 text-[9px] text-ab-accent">يعمل</span>
              ) : !online ? (
                <span className="shrink-0 text-[9px] text-stone-400">نائم</span>
              ) : null}
            </button>
          )
        })}
        <AgentsManagePanel scopeId={scopeId} compact />
        <CollabModeToggle scopeId={scopeId} />
      </div>
      {pressTip ? (
        <p
          className="rounded-md border border-ab-border bg-stone-50 px-2 py-1 text-[10px] text-stone-700"
          role="status"
        >
          {pressTip}
        </p>
      ) : null}
      {answeringAgentId && (
        <p className="text-[10px] font-medium text-ab-accent">
          {agents.find((a) => a.id === answeringAgentId)?.nameAr || 'وكيل'}{' '}
          يعمل الآن…
        </p>
      )}
      {!answeringAgentId && agents.length > 0 && agents.length <= ROOM_AGENT_SOFT_CAP && (
        <p className="truncate text-[10px] text-stone-400">
          شغال / نائم · الرسالة توقظ وكيل١ · {collabMode === 'team' ? 'تعاون' : 'منفصل'}
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
