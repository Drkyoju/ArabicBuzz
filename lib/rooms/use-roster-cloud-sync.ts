'use client'

import { useEffect, useRef } from 'react'
import { authHeaders, getBrowserSession } from '@/lib/supabase/browser'
import { useAgentRosterStore } from '@/lib/rooms/agent-roster-store'
import type { AgentRosterPayload } from '@/lib/rooms/roster-types'
import {
  exportScopeRosterSlice,
  usesSharedRoomRoster,
} from '@/lib/rooms/roster-scope'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'

/**
 * Hydrate roster from server when logged in; debounce push on local changes.
 * Shared team rooms: one pool for all staff (scope_agent_rosters).
 * Personal desks: per-user as before.
 */
export function useRosterCloudSync() {
  const activeScopeId = useWorkspaceStore(
    (s) => s.activeScopeId || PRIMARY_TEAM_SCOPE_ID
  )
  const hydrateFromCloud = useAgentRosterStore((s) => s.hydrateFromCloud)
  const hydrateScopeFromCloud = useAgentRosterStore(
    (s) => s.hydrateScopeFromCloud
  )
  const exportPayload = useAgentRosterStore((s) => s.exportPayload)
  const markCloudSynced = useAgentRosterStore((s) => s.markCloudSynced)
  const customAgents = useAgentRosterStore((s) => s.customAgents)
  const removedFromScope = useAgentRosterStore((s) => s.removedFromScope)
  const addedToScope = useAgentRosterStore((s) => s.addedToScope)
  const collabModeByScope = useAgentRosterStore((s) => s.collabModeByScope)
  const agentsEnabledByScope = useAgentRosterStore((s) => s.agentsEnabledByScope)
  const agentOverrides = useAgentRosterStore((s) => s.agentOverrides)

  const readyRef = useRef(false)
  const skipPushRef = useRef(false)
  const scopeRef = useRef(activeScopeId)

  useEffect(() => {
    scopeRef.current = activeScopeId
    let cancelled = false
    readyRef.current = false
    void (async () => {
      try {
        const session = await getBrowserSession()
        if (!session?.user || cancelled) {
          readyRef.current = true
          return
        }
        const scopeId = scopeRef.current
        const shared = usesSharedRoomRoster(scopeId)
        const res = await fetch(
          `/api/rooms/agents/roster?scopeId=${encodeURIComponent(scopeId)}`,
          { headers: await authHeaders() }
        )
        if (!res.ok || cancelled) {
          readyRef.current = true
          return
        }
        const data = (await res.json()) as {
          payload?: AgentRosterPayload | null
          synced?: boolean
          shared?: boolean
        }
        if (data.payload && data.synced) {
          const local = exportPayload()
          const cloudHasData =
            (data.payload.customAgents?.length || 0) > 0 ||
            Object.keys(data.payload.addedToScope || {}).length > 0 ||
            Object.keys(data.payload.agentOverrides || {}).length > 0 ||
            Object.keys(data.payload.collabModeByScope || {}).length > 0 ||
            Object.keys(data.payload.agentsEnabledByScope || {}).length > 0
          const localSlice = shared
            ? exportScopeRosterSlice(scopeId, local)
            : local
          const localHasData =
            localSlice.customAgents.length > 0 ||
            Object.keys(localSlice.addedToScope).length > 0 ||
            Object.keys(localSlice.agentOverrides).length > 0 ||
            Object.keys(localSlice.collabModeByScope).length > 0 ||
            Object.keys(localSlice.agentsEnabledByScope || {}).length > 0

          if (cloudHasData) {
            skipPushRef.current = true
            if (shared || data.shared) {
              hydrateScopeFromCloud(scopeId, data.payload)
            } else {
              hydrateFromCloud(data.payload)
            }
          } else if (localHasData) {
            await fetch('/api/rooms/agents/roster', {
              method: 'PUT',
              headers: await authHeaders({
                'Content-Type': 'application/json',
              }),
              body: JSON.stringify({
                scopeId,
                payload: shared ? localSlice : local,
              }),
            })
            markCloudSynced()
          } else {
            markCloudSynced()
          }
        } else {
          markCloudSynced()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-hydrate when room changes
  }, [activeScopeId])

  // Soft refresh shared room pool so teammates see seat changes.
  useEffect(() => {
    if (!usesSharedRoomRoster(activeScopeId)) return
    const refresh = () => {
      void (async () => {
        try {
          const session = await getBrowserSession()
          if (!session?.user || !readyRef.current) return
          const res = await fetch(
            `/api/rooms/agents/roster?scopeId=${encodeURIComponent(activeScopeId)}`,
            { headers: await authHeaders() }
          )
          if (!res.ok) return
          const data = (await res.json()) as {
            payload?: AgentRosterPayload | null
            synced?: boolean
          }
          if (data.payload && data.synced) {
            skipPushRef.current = true
            hydrateScopeFromCloud(activeScopeId, data.payload)
          }
        } catch {
          /* ignore */
        }
      })()
    }
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    const t = window.setInterval(refresh, 45_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(t)
    }
  }, [activeScopeId, hydrateScopeFromCloud])

  useEffect(() => {
    if (!readyRef.current) return
    if (skipPushRef.current) {
      skipPushRef.current = false
      return
    }
    const scopeId = scopeRef.current
    const t = setTimeout(() => {
      void (async () => {
        try {
          const session = await getBrowserSession()
          if (!session?.user) return
          const full = exportPayload()
          const shared = usesSharedRoomRoster(scopeId)
          const payload = shared
            ? exportScopeRosterSlice(scopeId, full)
            : full
          const res = await fetch('/api/rooms/agents/roster', {
            method: 'PUT',
            headers: await authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ scopeId, payload }),
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
    agentsEnabledByScope,
    agentOverrides,
    activeScopeId,
    exportPayload,
    markCloudSynced,
  ])
}
