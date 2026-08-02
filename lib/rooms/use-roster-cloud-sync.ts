'use client'

import { useEffect, useRef } from 'react'
import { authHeaders, getBrowserSession } from '@/lib/supabase/browser'
import { useAgentRosterStore } from '@/lib/rooms/agent-roster-store'
import type { AgentRosterPayload } from '@/lib/rooms/roster-types'

/**
 * Hydrate roster from server when logged in; debounce push on local changes.
 */
export function useRosterCloudSync() {
  const hydrateFromCloud = useAgentRosterStore((s) => s.hydrateFromCloud)
  const exportPayload = useAgentRosterStore((s) => s.exportPayload)
  const markCloudSynced = useAgentRosterStore((s) => s.markCloudSynced)
  const customAgents = useAgentRosterStore((s) => s.customAgents)
  const removedFromScope = useAgentRosterStore((s) => s.removedFromScope)
  const addedToScope = useAgentRosterStore((s) => s.addedToScope)
  const collabModeByScope = useAgentRosterStore((s) => s.collabModeByScope)
  const agentOverrides = useAgentRosterStore((s) => s.agentOverrides)

  const readyRef = useRef(false)
  const skipPushRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const session = await getBrowserSession()
        if (!session?.user || cancelled) {
          readyRef.current = true
          return
        }
        const res = await fetch('/api/rooms/agents/roster', {
          headers: await authHeaders(),
        })
        if (!res.ok || cancelled) {
          readyRef.current = true
          return
        }
        const data = (await res.json()) as {
          payload?: AgentRosterPayload | null
          synced?: boolean
        }
        if (data.payload && data.synced) {
          const local = exportPayload()
          const cloudHasData =
            (data.payload.customAgents?.length || 0) > 0 ||
            Object.keys(data.payload.addedToScope || {}).length > 0 ||
            Object.keys(data.payload.agentOverrides || {}).length > 0
          const localHasData =
            local.customAgents.length > 0 ||
            Object.keys(local.addedToScope).length > 0 ||
            Object.keys(local.agentOverrides).length > 0
          // Prefer cloud when it has data; otherwise keep local and upload.
          if (cloudHasData) {
            skipPushRef.current = true
            hydrateFromCloud(data.payload)
          } else if (localHasData) {
            await fetch('/api/rooms/agents/roster', {
              method: 'PUT',
              headers: await authHeaders({
                'Content-Type': 'application/json',
              }),
              body: JSON.stringify({ payload: local }),
            })
            markCloudSynced()
          } else {
            markCloudSynced()
          }
        }
      } catch {
        /* offline / anonymous */
      } finally {
        readyRef.current = true
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once on mount
  }, [])

  useEffect(() => {
    if (!readyRef.current) return
    if (skipPushRef.current) {
      skipPushRef.current = false
      return
    }
    const t = setTimeout(() => {
      void (async () => {
        try {
          const session = await getBrowserSession()
          if (!session?.user) return
          const payload = exportPayload()
          const res = await fetch('/api/rooms/agents/roster', {
            method: 'PUT',
            headers: await authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ payload }),
          })
          if (res.ok) markCloudSynced()
        } catch {
          /* ignore */
        }
      })()
    }, 900)
    return () => clearTimeout(t)
  }, [
    customAgents,
    removedFromScope,
    addedToScope,
    collabModeByScope,
    agentOverrides,
    exportPayload,
    markCloudSynced,
  ])
}
