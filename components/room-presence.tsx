'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createBrowserSupabaseClient,
  getBrowserSession,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'

type Peer = {
  key: string
  name: string
  typing?: boolean
  surface?: string
  kind?: 'human' | 'agent'
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1)
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`
}

export function RoomPresenceBar({
  scopeId,
  typing,
  displayName,
  surface = 'feed',
  compact = false,
  agentTyping = false,
  agentName = 'الوكيل',
}: {
  scopeId: string
  typing: boolean
  displayName?: string
  /** Where the local user is focused: feed | canvas | composer */
  surface?: string
  compact?: boolean
  /** Local AI is generating a reply */
  agentTyping?: boolean
  agentName?: string
}) {
  const [peers, setPeers] = useState<Peer[]>([])
  const [remoteAgentTyping, setRemoteAgentTyping] = useState<{
    name: string
  } | null>(null)
  const channelRef = useRef<{
    track: (payload: Record<string, unknown>) => Promise<unknown>
  } | null>(null)
  const nameRef = useRef(displayName || 'أنت')
  const typingRef = useRef(typing)
  const surfaceRef = useRef(surface)

  useEffect(() => {
    try {
      nameRef.current =
        displayName ||
        localStorage.getItem('ab-display-name') ||
        nameRef.current
    } catch {
      if (displayName) nameRef.current = displayName
    }
  }, [displayName])

  useEffect(() => {
    typingRef.current = typing
    surfaceRef.current = surface
  }, [typing, surface])

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setPeers([
        {
          key: 'local',
          name: nameRef.current,
          typing: typingRef.current,
          surface: surfaceRef.current,
          kind: 'human',
        },
      ])
      return
    }
    let cancelled = false
    let channel: ReturnType<
      ReturnType<typeof createBrowserSupabaseClient>['channel']
    > | null = null
    const sb = createBrowserSupabaseClient()

    void (async () => {
      const session = await getBrowserSession()
      if (cancelled) return
      const name =
        nameRef.current ||
        session?.user?.user_metadata?.full_name ||
        session?.user?.email?.split('@')[0] ||
        'مستخدم'
      nameRef.current = String(name)
      const userKey =
        session?.user?.id ||
        `guest-${Math.random().toString(36).slice(2, 8)}`

      channel = sb.channel(`presence-room:${scopeId}`, {
        config: { presence: { key: userKey } },
      })
      channelRef.current = channel

      channel.on('presence', { event: 'sync' }, () => {
        if (cancelled) return
        const state = channel!.presenceState() as Record<
          string,
          Array<{
            name?: string
            typing?: boolean
            surface?: string
            kind?: 'human' | 'agent'
          }>
        >
        const list: Peer[] = Object.entries(state).map(([key, rows]) => ({
          key,
          name: rows[0]?.name || 'مستخدم',
          typing: Boolean(rows[0]?.typing),
          surface: rows[0]?.surface,
          kind: rows[0]?.kind === 'agent' ? 'agent' : 'human',
        }))
        setPeers(list)
      })

      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel!.track({
            name: nameRef.current,
            typing: typingRef.current,
            surface: surfaceRef.current,
            kind: 'human',
            at: Date.now(),
          })
        }
      })
    })()

    return () => {
      cancelled = true
      channelRef.current = null
      if (channel) void sb.removeChannel(channel)
    }
  }, [scopeId])

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setPeers([
        {
          key: 'local',
          name: nameRef.current,
          typing,
          surface,
          kind: 'human',
        },
      ])
      return
    }
    const ch = channelRef.current
    if (!ch) return
    void ch.track({
      name: nameRef.current,
      typing,
      surface,
      kind: 'human',
      at: Date.now(),
    })
  }, [typing, surface])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const sb = createBrowserSupabaseClient()
    const ch = sb.channel(`agent-typing:${scopeId}`)
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const p = payload as { name?: string; typing?: boolean }
      if (p?.typing) setRemoteAgentTyping({ name: p.name || 'الوكيل' })
      else setRemoteAgentTyping(null)
    })
    void ch.subscribe()
    return () => {
      void sb.removeChannel(ch)
    }
  }, [scopeId])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const sb = createBrowserSupabaseClient()
    const ch = sb.channel(`agent-typing:${scopeId}`)
    void ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void ch.send({
          type: 'broadcast',
          event: 'typing',
          payload: { name: agentName, typing: agentTyping },
        })
      }
    })
    return () => {
      void ch.send({
        type: 'broadcast',
        event: 'typing',
        payload: { name: agentName, typing: false },
      })
      void sb.removeChannel(ch)
    }
  }, [agentTyping, agentName, scopeId])

  const humans = peers.filter((p) => p.kind !== 'agent')
  const selfName = displayName || 'أنت'
  const online =
    humans.length > 0
      ? humans
      : [{ key: 'self', name: selfName, surface, kind: 'human' as const }]
  const humanTyping = online.filter((p) => p.typing).map((p) => p.name)
  const surfaceLabel = (s?: string) =>
    s === 'canvas' ? 'اللوحة' : s === 'composer' ? 'الكتابة' : 'المحادثة'

  const showAgent = agentTyping || Boolean(remoteAgentTyping)
  const agentDisplay = agentTyping
    ? agentName
    : remoteAgentTyping?.name || 'الوكيل'
  const agentLine = showAgent ? `${agentDisplay} يكتب…` : null
  const humanLine =
    humanTyping.length > 0 ? `${humanTyping.join('، ')} يكتب…` : null

  if (compact) {
    return (
      <div
        className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500"
        dir="rtl"
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600"
          aria-hidden
          title="بشري متصل"
        />
        <span>
          بشر ({online.length})
          {showAgent ? (
            <span className="mr-1 text-violet-700"> · AI نشط</span>
          ) : online.length === 1 ? (
            ` · ${online[0].name}`
          ) : (
            ''
          )}
        </span>
        {(agentLine || humanLine) && (
          <span className={showAgent ? 'text-violet-700' : 'text-ab-accent'}>
            — {agentLine || humanLine}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500" dir="rtl">
      <div className="flex items-center -space-x-2 space-x-reverse" aria-hidden>
        {online.slice(0, 5).map((p, i) => (
          <span
            key={p.key}
            title={`${p.name} · بشري`}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9px] font-bold text-white',
              p.typing ? 'bg-ab-accent' : 'bg-emerald-700'
            )}
            style={{ zIndex: 10 - i }}
          >
            {initials(p.name)}
          </span>
        ))}
        {showAgent && (
          <span
            title={`${agentDisplay} · ذكاء اصطناعي`}
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-[9px] font-bold text-white"
            style={{ zIndex: 1 }}
          >
            AI
          </span>
        )}
        {online.length > 5 && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-stone-400 text-[9px] font-bold text-white">
            +{online.length - 5}
          </span>
        )}
      </div>
      <span>
        <span className="font-medium text-emerald-700">
          بشر ({online.length})
        </span>
        <span className="mr-1 text-ab-ink">
          {online.map((p) => p.name).join(' · ')}
        </span>
        {showAgent && (
          <span className="mr-1 font-medium text-violet-700">
            · AI: {agentDisplay}
          </span>
        )}
      </span>
      {(agentLine || humanLine) && (
        <span className={showAgent ? 'text-violet-700' : 'text-ab-accent'}>
          — {agentLine || humanLine}
        </span>
      )}
      {online.some((p) => p.surface && p.surface !== 'feed') && (
        <span className="text-stone-400">
          ·{' '}
          {online
            .filter((p) => p.surface && p.surface !== 'feed')
            .map((p) => `${p.name} في ${surfaceLabel(p.surface)}`)
            .join(' · ')}
        </span>
      )}
    </div>
  )
}
