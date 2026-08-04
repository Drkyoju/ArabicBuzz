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
}: {
  scopeId: string
  typing: boolean
  displayName?: string
  /** Where the local user is focused: feed | canvas | composer */
  surface?: string
  compact?: boolean
}) {
  const [peers, setPeers] = useState<Peer[]>([])
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
          Array<{ name?: string; typing?: boolean; surface?: string }>
        >
        const list: Peer[] = Object.entries(state).map(([key, rows]) => ({
          key,
          name: rows[0]?.name || 'مستخدم',
          typing: Boolean(rows[0]?.typing),
          surface: rows[0]?.surface,
        }))
        setPeers(list)
      })

      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel!.track({
            name: nameRef.current,
            typing: typingRef.current,
            surface: surfaceRef.current,
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
      setPeers([{ key: 'local', name: nameRef.current, typing, surface }])
      return
    }
    const ch = channelRef.current
    if (!ch) return
    void ch.track({
      name: nameRef.current,
      typing,
      surface,
      at: Date.now(),
    })
  }, [typing, surface])

  const typingNames = peers.filter((p) => p.typing).map((p) => p.name)
  const selfName = displayName || 'أنت'
  const online =
    peers.length > 0 ? peers : [{ key: 'self', name: selfName, surface }]
  const surfaceLabel = (s?: string) =>
    s === 'canvas' ? 'اللوحة' : s === 'composer' ? 'الكتابة' : 'المحادثة'

  if (compact) {
    return (
      <div
        className="flex items-center gap-1.5 text-[11px] text-stone-500"
        dir="rtl"
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600"
          aria-hidden
        />
        <span>
          متصل ({online.length})
          {typingNames.length > 0
            ? ` · ${typingNames[0]} يكتب…`
            : online.length === 1
              ? ` · ${online[0].name}`
              : ''}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500" dir="rtl">
      <div className="flex items-center -space-x-2 space-x-reverse" aria-hidden>
        {online.slice(0, 6).map((p, i) => (
          <span
            key={p.key}
            title={p.name}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9px] font-bold text-white',
              p.typing ? 'bg-ab-accent' : 'bg-emerald-700'
            )}
            style={{ zIndex: 10 - i }}
          >
            {initials(p.name)}
          </span>
        ))}
        {online.length > 6 && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-stone-400 text-[9px] font-bold text-white">
            +{online.length - 6}
          </span>
        )}
      </div>
      <span>
        <span className="font-medium text-emerald-700">
          متصل ({online.length})
        </span>
        <span className="mr-1 text-ab-ink">
          {online.map((p) => p.name).join(' · ')}
        </span>
      </span>
      {typingNames.length > 0 && (
        <span className="text-ab-accent">
          — {typingNames.join('، ')} يكتب…
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
