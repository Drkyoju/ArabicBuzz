'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createBrowserSupabaseClient,
  getBrowserSession,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'

type Peer = { key: string; name: string; typing?: boolean }

export function RoomPresenceBar({
  scopeId,
  typing,
}: {
  scopeId: string
  typing: boolean
}) {
  const [peers, setPeers] = useState<Peer[]>([])
  const channelRef = useRef<{
    track: (payload: Record<string, unknown>) => Promise<unknown>
  } | null>(null)
  const nameRef = useRef('مستخدم')

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let cancelled = false
    let channel: ReturnType<
      ReturnType<typeof createBrowserSupabaseClient>['channel']
    > | null = null
    const sb = createBrowserSupabaseClient()

    void (async () => {
      const session = await getBrowserSession()
      if (cancelled) return
      const name =
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
    const ch = channelRef.current
    if (!ch) return
    void ch.track({ name: nameRef.current, typing, at: Date.now() })
  }, [typing])

  const typingNames = peers.filter((p) => p.typing).map((p) => p.name)

  return (
    <div className="text-[11px] text-stone-500" dir="rtl">
      <span className="font-medium text-ab-ink">
        متصلون ({Math.max(peers.length, 1)}):{' '}
      </span>
      {peers.length === 0
        ? 'أنت'
        : peers.map((p) => p.name).join(' · ')}
      {typingNames.length > 0 && (
        <span className="mr-2 text-ab-accent">
          — {typingNames.join('، ')} يكتب…
        </span>
      )}
    </div>
  )
}
