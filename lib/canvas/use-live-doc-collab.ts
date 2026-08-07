'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  createBrowserSupabaseClient,
  getBrowserSession,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'
import { colorForUserKey } from '@/lib/canvas/collab-colors'
import { resolveClientDisplayName } from '@/lib/auth/display-name'
import {
  refreshRemoteCursors,
  type RemoteCursorState,
} from '@/lib/canvas/remote-cursors-extension'

type CursorPayload = {
  type: 'cursor'
  clientId: string
  name: string
  color: string
  from: number
  to: number
  docId: string
  at: number
}

type ContentPayload = {
  type: 'content'
  clientId: string
  name: string
  html: string
  docId: string
  at: number
  rev: number
}

type CollabPayload = CursorPayload | ContentPayload

/**
 * Google Docs–style live cursors + soft HTML sync over Supabase broadcast.
 * Not a full CRDT — last-write-wins for content; cursors are realtime.
 */
export function useLiveDocCollab(opts: {
  scopeId?: string
  docId?: string
  displayName?: string
  editor: Editor | null
  enabled?: boolean
  onRemoteContent?: (html: string) => void
}) {
  const { scopeId, docId, displayName, editor, enabled = true, onRemoteContent } =
    opts
  const [peers, setPeers] = useState<RemoteCursorState[]>([])
  const cursorsRef = useRef<Map<string, RemoteCursorState>>(new Map())
  const clientIdRef = useRef('')
  const nameRef = useRef(displayName || 'مستخدم')
  const colorRef = useRef('#2563EB')
  const revRef = useRef(0)
  const applyingRemote = useRef(false)
  const lastLocalEdit = useRef(0)
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createBrowserSupabaseClient>['channel']
  > | null>(null)

  const getCursors = useCallback(() => {
    return [...cursorsRef.current.values()].filter(
      (c) => c.clientId !== clientIdRef.current
    )
  }, [])

  useEffect(() => {
    if (displayName) nameRef.current = displayName
  }, [displayName])

  useEffect(() => {
    if (!enabled || !scopeId || !docId || !isSupabaseConfigured()) {
      cursorsRef.current.clear()
      setPeers([])
      return
    }

    let cancelled = false
    const sb = createBrowserSupabaseClient()
    let channel: typeof channelRef.current = null

    void (async () => {
      const session = await getBrowserSession()
      if (cancelled) return
      const clientId =
        session?.user?.id ||
        `guest-${Math.random().toString(36).slice(2, 10)}`
      clientIdRef.current = clientId
      colorRef.current = colorForUserKey(clientId)
      try {
        nameRef.current = resolveClientDisplayName({
          user: session?.user,
          override: displayName || localStorage.getItem('ab-display-name'),
          fallback: 'مستخدم',
        })
      } catch {
        /* ignore */
      }

      channel = sb.channel(`doc-collab:${scopeId}:${docId}`, {
        config: { broadcast: { self: false } },
      })
      channelRef.current = channel

      channel.on('broadcast', { event: 'collab' }, ({ payload }) => {
        if (cancelled) return
        const data = payload as CollabPayload
        if (!data || data.clientId === clientIdRef.current) return
        if (data.docId !== docId) return

        if (data.type === 'cursor') {
          cursorsRef.current.set(data.clientId, {
            clientId: data.clientId,
            name: data.name,
            color: data.color,
            from: data.from,
            to: data.to,
          })
          // Drop stale cursors (>8s)
          const now = Date.now()
          for (const [k, v] of cursorsRef.current) {
            if (now - (data.at || now) > 12_000 && k === data.clientId) {
              /* keep updating this one below */
            }
            void v
          }
          setPeers(getCursors())
          if (editor) refreshRemoteCursors(editor)
        }

        if (data.type === 'content') {
          if (data.rev <= revRef.current) return
          // Don't clobber active local typing
          if (Date.now() - lastLocalEdit.current < 900) return
          revRef.current = data.rev
          applyingRemote.current = true
          onRemoteContent?.(data.html)
          if (editor && editor.getHTML() !== data.html) {
            editor.commands.setContent(data.html, { emitUpdate: false })
          }
          queueMicrotask(() => {
            applyingRemote.current = false
          })
        }
      })

      await channel.subscribe()
    })()

    const prune = window.setInterval(() => {
      /* soft prune: remove peers not refreshed — handled by overwrite map size */
      if (cursorsRef.current.size > 20) {
        const keep = getCursors().slice(0, 12)
        cursorsRef.current = new Map(keep.map((c) => [c.clientId, c]))
        setPeers(keep)
      }
    }, 10_000)

    return () => {
      cancelled = true
      window.clearInterval(prune)
      channelRef.current = null
      if (channel) void sb.removeChannel(channel)
      cursorsRef.current.clear()
      setPeers([])
    }
  }, [enabled, scopeId, docId, displayName, editor, getCursors, onRemoteContent])

  const broadcastCursor = useCallback(
    (from: number, to: number) => {
      const ch = channelRef.current
      if (!ch || !docId || !clientIdRef.current) return
      const payload: CursorPayload = {
        type: 'cursor',
        clientId: clientIdRef.current,
        name: nameRef.current,
        color: colorRef.current,
        from,
        to,
        docId,
        at: Date.now(),
      }
      void ch.send({
        type: 'broadcast',
        event: 'collab',
        payload,
      })
    },
    [docId]
  )

  const broadcastContent = useCallback(
    (html: string) => {
      if (applyingRemote.current) return
      lastLocalEdit.current = Date.now()
      revRef.current += 1
      const ch = channelRef.current
      if (!ch || !docId || !clientIdRef.current) return
      const payload: ContentPayload = {
        type: 'content',
        clientId: clientIdRef.current,
        name: nameRef.current,
        html,
        docId,
        at: Date.now(),
        rev: revRef.current,
      }
      void ch.send({
        type: 'broadcast',
        event: 'collab',
        payload,
      })
    },
    [docId]
  )

  const markLocalEdit = useCallback(() => {
    lastLocalEdit.current = Date.now()
  }, [])

  return {
    peers,
    getCursors,
    broadcastCursor,
    broadcastContent,
    markLocalEdit,
    localColor: colorRef.current,
  }
}
