'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createBrowserSupabaseClient,
  getBrowserSession,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'

type Peer = { key: string; name: string; typing?: boolean }

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
}: {
  scopeId: string
  typing: boolean
  displayName?: string
}) {
  const [peers, setPeers] = useState<Peer[]>([])
  const channelRef = useRef<{
    track: (payload: Record<string, unknown>) => Promise<unknown>
  } | null>(null)
  const nameRef = useRef(displayName || 'أنت')

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
    if (!isSupabaseConfigured()) {
      setPeers([{ key: 'local', name: nameRef.current, typing }])
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
          Array<{ name?: string; typing?: boolean }>
        >
        const list: Peer[] = Object.entries(state).map(([key, rows]) => ({
          key,
          name: rows[0]?.name || 'مستخدم',
          typing: Boolean(rows[0]?.typing),
        }))
        setPeers(list)
      })

      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel!.track({
            name: nameRef.current,
            typing: false,
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
      setPeers([{ key: 'local', name: nameRef.current, typing }])
      return
    }
    const ch = channelRef.current
    if (!ch) return
    void ch.track({ name: nameRef.current, typing, at: Date.now() })
  }, [typing])

  const typingNames = peers.filter((p) => p.typing).map((p) => p.name)
  const online =
    peers.length > 0 ? peers : [{ key: 'self', name: nameRef.current }]

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
    </div>
  )
}
