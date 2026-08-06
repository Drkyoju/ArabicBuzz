'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PanelRightOpen, MessageSquare } from 'lucide-react'
import { RoomPostCard } from '@/components/room-post'
import { CanvasWorkspace } from '@/components/canvas/canvas-workspace'
import { ComposerMicButton } from '@/components/composer-mic-button'
import { useCanvasStore } from '@/lib/canvas/store'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'
import {
  createBrowserSupabaseClient,
  getBrowserSession,
  isSupabaseConfigured,
  authHeaders,
} from '@/lib/supabase/browser'
import { isSharedScope } from '@/lib/scopes/manager'
import {
  hydrateScopeMemories,
  useWorkspaceStore,
} from '@/lib/scopes/workspace-store'
import { LocalUploadPanel } from '@/components/local-upload-panel'
import { RoomPresenceBar, broadcastRoomEdit } from '@/components/room-presence'
import { ZoomLivePanel } from '@/components/zoom-live-panel'
import { AgentSeatsPanel } from '@/components/agent-seats-panel'
import { FirstRunChecklist } from '@/components/first-run-checklist'
import { RoomTeamPanel } from '@/components/room-team-panel'
import { ModelPicker } from '@/components/model-picker'
import { HelpTip } from '@/components/help-tip'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useSecurityPostureStore } from '@/lib/security/posture-store'
import { resolveMentionHandoff, type RoomAgent } from '@/lib/rooms/agents'
import { useAgentRosterStore } from '@/lib/rooms/agent-roster-store'
import { useRosterCloudSync } from '@/lib/rooms/use-roster-cloud-sync'
import type {
  RoomCitation,
  RoomFileAttachment,
  RoomPost,
} from '@/lib/scopes/types'
import {
  extractCitationsFromToolOutput,
  extractPausedApprovalId,
} from '@/lib/agents/citation-events'
import { createArtifactStreamParser } from '@/lib/agents/canvas-stream'
import { cn } from '@/lib/utils'

const EMPTY_POSTS: RoomPost[] = []

const MEMBERS_PANE_MIN = 320
const SEATS_MIN = 72
const SEATS_MAX = 360
const SEATS_DEFAULT = 160

function clampMembersPanePx(px: number): number {
  const vh =
    typeof window !== 'undefined' ? window.innerHeight : 800
  const max = Math.round(vh * 0.85)
  return Math.min(max, Math.max(MEMBERS_PANE_MIN, Math.round(px)))
}

function defaultMembersPanePx(): number {
  const vh =
    typeof window !== 'undefined' ? window.innerHeight : 800
  // Usable default (~45vh, floor 320px) — drag handle adjusts further.
  return clampMembersPanePx(Math.round(vh * 0.45))
}

function readMembersPanePx(scopeId: string): number {
  try {
    const n = Number(localStorage.getItem(`ab-room-members-h:${scopeId}`) || '')
    if (Number.isFinite(n) && n >= MEMBERS_PANE_MIN) return clampMembersPanePx(n)
  } catch {
    /* ignore */
  }
  return defaultMembersPanePx()
}

function persistMembersPanePx(scopeId: string, px: number) {
  try {
    localStorage.setItem(`ab-room-members-h:${scopeId}`, String(px))
  } catch {
    /* ignore */
  }
}

function clampSeatsPx(px: number): number {
  return Math.min(SEATS_MAX, Math.max(SEATS_MIN, Math.round(px)))
}

function readSeatsPx(scopeId: string): number {
  try {
    const scoped = Number(
      localStorage.getItem(`ab-room-seats-max-px:${scopeId}`) || ''
    )
    if (Number.isFinite(scoped)) return clampSeatsPx(scoped)
    const legacy = Number(localStorage.getItem('ab-room-seats-max-px') || '')
    if (Number.isFinite(legacy)) return clampSeatsPx(legacy)
  } catch {
    /* ignore */
  }
  return SEATS_DEFAULT
}

function persistSeatsPx(scopeId: string, px: number) {
  try {
    localStorage.setItem(`ab-room-seats-max-px:${scopeId}`, String(px))
    localStorage.setItem('ab-room-seats-max-px', String(px))
  } catch {
    /* ignore */
  }
}

/**
 * Shared room workspace: persist + realtime + @mentions + outbound.
 */
export function RoomWorkspace({ className }: { className?: string }) {
  const { selectedModel } = useModelPickerStore()
  const {
    artifacts,
    isCanvasFullscreen,
    toggleCanvasFullscreen,
    upsertArtifact,
    splitRatio,
    setSplitRatio,
  } = useCanvasStore()
  const feedRef = useRef<HTMLDivElement>(null)
  const chatColumnRef = useRef<HTMLElement>(null)
  const dragSplit = useRef(false)
  const dragChrome = useRef(false)
  const dragMembers = useRef(false)
  const [seatsMaxPx, setSeatsMaxPx] = useState(SEATS_DEFAULT)
  const [seatsCollapsed, setSeatsCollapsed] = useState(true)
  const [membersPanePx, setMembersPanePx] = useState(defaultMembersPanePx)

  const activeScopeId = useWorkspaceStore((s) => s.activeScopeId)
  const setActiveScopeId = useWorkspaceStore((s) => s.setActiveScopeId)
  const scopes = useWorkspaceStore((s) => s.scopes)
  const postsByScope = useWorkspaceStore((s) => s.postsByScope)
  const activeScope = useMemo(
    () => scopes.find((s) => s.id === activeScopeId),
    [scopes, activeScopeId]
  )
  const posts = useMemo(
    () => postsByScope[activeScopeId] || EMPTY_POSTS,
    [postsByScope, activeScopeId]
  )
  const appendPost = useWorkspaceStore((s) => s.appendPost)
  const updatePost = useWorkspaceStore((s) => s.updatePost)
  const setPostsForScope = useWorkspaceStore((s) => s.setPostsForScope)
  const mergePost = useWorkspaceStore((s) => s.mergePost)

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [answeringAgentId, setAnsweringAgentId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('أنت')
  const [outboundMsg, setOutboundMsg] = useState('')
  const [telegramReady, setTelegramReady] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [typing, setTyping] = useState(false)
  const [showCanvas, setShowCanvas] = useState(true)
  const [showMore, setShowMore] = useState(false)
  const [micNote, setMicNote] = useState('')
  const [sendBlockedAr, setSendBlockedAr] = useState('')
  const [presenceSurface, setPresenceSurface] = useState('feed')
  const prevArtifactCount = useRef(0)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const runAbortRef = useRef<AbortController | null>(null)
  const signedIn = useSignedIn()
  const isGuest = signedIn === false
  useRosterCloudSync()
  const posture = useSecurityPostureStore((s) => s.posture)
  const hasArtifacts = artifacts.length > 0
  const canvasOpen = isCanvasFullscreen || (showCanvas && hasArtifacts)

  const agentsForScopeFn = useAgentRosterStore((s) => s.agentsForScope)
  const allAgentsFn = useAgentRosterStore((s) => s.allAgents)
  const collabMode = useAgentRosterStore(
    (s) => s.collabModeByScope[activeScopeId] || 'solo'
  )
  const roomAgents = useMemo(
    () => agentsForScopeFn(activeScopeId),
    [agentsForScopeFn, activeScopeId]
  )
  const agentCatalog = useMemo(() => allAgentsFn(), [allAgentsFn])

  // Auto-open canvas when a new artifact appears
  useEffect(() => {
    if (artifacts.length > prevArtifactCount.current) {
      setShowCanvas(true)
    }
    prevArtifactCount.current = artifacts.length
  }, [artifacts.length])

  // Shared rooms: keep activity collapsed by default so chat stays primary
  useEffect(() => {
    setShowMore(false)
    setMembersPanePx(readMembersPanePx(activeScopeId))
    setSeatsMaxPx(readSeatsPx(activeScopeId))
  }, [activeScopeId])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/integrations/status')
      .then((r) => r.json())
      .then((data: { telegramOutboundReady?: boolean }) => {
        if (cancelled) return
        setTelegramReady(Boolean(data.telegramOutboundReady))
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void getBrowserSession().then((session) => {
      if (cancelled) return
      const u = session?.user
      let name =
        u?.user_metadata?.full_name ||
        u?.user_metadata?.name ||
        u?.email?.split('@')[0] ||
        'أنت'
      try {
        const saved = localStorage.getItem('ab-display-name')
        if (saved) name = saved
        // Restore scope only if still a known id (don't clobber a brand-new session)
        const scope = localStorage.getItem('ab-active-scope')
        if (scope) {
          const known = useWorkspaceStore.getState().scopes.some((s) => s.id === scope)
          if (known) setActiveScopeId(scope)
        }
      } catch {
        /* ignore */
      }
      setDisplayName(String(name))
    })
    hydrateScopeMemories()
    return () => {
      cancelled = true
    }
  }, [setActiveScopeId])

  useEffect(() => {
    if (signedIn !== true) {
      setShowOnboarding(false)
      return
    }
    try {
      if (!localStorage.getItem('ab-onboarded')) setShowOnboarding(true)
    } catch {
      /* ignore */
    }
  }, [signedIn])

  useEffect(() => {
    feedRef.current?.scrollTo({
      top: feedRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [posts, streaming, activeScopeId])

  useEffect(() => {
    setInput('')
    setOutboundMsg('')
    // Canvas store is global — hide cross-room artifacts when switching desks
    useCanvasStore.setState({ artifacts: [], activeId: null })
  }, [activeScopeId])

  // Hydrate + realtime
  useEffect(() => {
    if (signedIn !== true) return
    let cancelled = false
    async function hydrate() {
      const headers = await authHeaders()
      const res = await fetch(
        `/api/rooms/posts?scopeId=${encodeURIComponent(activeScopeId)}`,
        { headers }
      )
      if (!res.ok || cancelled) return
      const data = (await res.json()) as { posts?: RoomPost[] }
      if (data.posts && data.posts.length > 0) {
        const cleaned = data.posts.filter((p) => {
          const c = p.content || ''
          if (c.includes('واحدةحدة')) return false
          if (c.includes('المجلد فارغ أو لا يمكن قراءته')) return false
          return true
        })
        setPostsForScope(activeScopeId, cleaned)
      }

      const canvasRes = await fetch(
        `/api/rooms/canvas?scopeId=${encodeURIComponent(activeScopeId)}`,
        { headers }
      )
      if (canvasRes.ok) {
        const c = (await canvasRes.json()) as {
          artifacts?: Array<{
            id: string
            type: string
            titleAr: string
            content: string
            language?: string
            updatedBy?: string | null
            updatedAt?: string | null
          }>
        }
        for (const a of c.artifacts || []) {
          upsertArtifact({
            id: a.id,
            type: (a.type as 'markdown') || 'markdown',
            titleAr: a.titleAr,
            content: a.content,
            language: a.language,
            updatedBy: a.updatedBy,
            updatedAt: a.updatedAt,
            isEditing: false,
          })
        }
      }
    }
    void hydrate()

    if (!isSupabaseConfigured()) return () => {
      cancelled = true
    }

    const sb = createBrowserSupabaseClient()
    const channel = sb
      .channel(`room-${activeScopeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_posts',
          filter: `scope_id=eq.${activeScopeId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, string>
          mergePost({
            id: row.id,
            scopeId: row.scope_id,
            authorKind:
              row.author_kind === 'agent'
                ? 'agent'
                : row.author_kind === 'system'
                  ? 'system'
                  : row.author_kind === 'channel'
                    ? 'channel'
                    : 'human',
            authorId: row.author_id,
            authorNameAr: row.author_name_ar,
            content: row.content,
            createdAt: new Date(row.created_at).getTime(),
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_canvas_artifacts',
          filter: `scope_id=eq.${activeScopeId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, string>
          if (!row?.id) return
          upsertArtifact({
            id: row.id,
            type: (row.type as 'markdown') || 'markdown',
            titleAr: row.title_ar,
            content: row.content,
            language: row.language,
            isEditing: false,
          })
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      void sb.removeChannel(channel)
    }
  }, [
    activeScopeId,
    mergePost,
    setPostsForScope,
    upsertArtifact,
    signedIn,
  ])

  if (!activeScope) {
    return (
      <div className="p-8 text-sm text-stone-500" dir="rtl">
        اختر مساحة من الشريط الجانبي.
      </div>
    )
  }

  const shared = isSharedScope(activeScope)
  const { agent: mentionPreview } = resolveMentionHandoff(input, agentCatalog)

  function stopAgentRun() {
    runAbortRef.current?.abort()
    runAbortRef.current = null
    setStreaming(false)
  }

  async function streamOneAgent(opts: {
    prompt: string
    agent: RoomAgent
    peerContextAr?: string
    postId: string
    headers: HeadersInit
    signal?: AbortSignal
  }): Promise<string> {
    if (opts.signal?.aborted) {
      updatePost(activeScopeId, opts.postId, {
        content: 'أُوقف التشغيل.',
        streaming: false,
      })
      return 'أُوقف التشغيل.'
    }

    let res: Response
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: opts.headers,
        signal: opts.signal,
        body: JSON.stringify({
          prompt: opts.prompt,
          modelId: opts.agent.preferredModel || selectedModel,
          scopeId: activeScopeId,
          agentId: opts.agent.id,
          agentProfile: {
            id: opts.agent.id,
            nameAr: opts.agent.nameAr,
            slug: opts.agent.slug,
            systemPromptAr: opts.agent.systemPromptAr,
            taskAr: opts.agent.taskAr,
            preferredModel: opts.agent.preferredModel,
          },
          peerContextAr: opts.peerContextAr,
          collabMode,
          persist: false,
          authorNameAr: displayName,
          securityPosture: posture,
          scopeMemory: useWorkspaceStore
            .getState()
            .memoriesForScope(activeScopeId),
        }),
      })
    } catch (e) {
      if (opts.signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
        updatePost(activeScopeId, opts.postId, {
          content: 'أُوقف التشغيل.',
          streaming: false,
        })
        return 'أُوقف التشغيل.'
      }
      throw e
    }

    if (!res.ok || !res.body) {
      let detail = ''
      try {
        const raw = await res.text()
        const parsed = JSON.parse(raw) as { error?: string; code?: string }
        detail = parsed.error || raw.slice(0, 200)
        if (parsed.code === 'AUTH_REQUIRED') {
          detail = 'سجّل الدخول للإرسال، ثم أعد المحاولة.'
          setSendBlockedAr(
            'سجّل الدخول للإرسال — انتهت جلستك أو لم تُسجّل الدخول بعد.'
          )
        }
      } catch {
        /* ignore */
      }
      const msg = detail
        ? `تعذّر الرد: ${detail}`
        : `تعذّر الرد (HTTP ${res.status}).`
      updatePost(activeScopeId, opts.postId, {
        content: msg,
        streaming: false,
      })
      return msg
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let assembled = ''
    const citations: RoomCitation[] = []
    const attachments: RoomFileAttachment[] = []
    let pendingApprovalId: string | undefined
    const artifactParser = createArtifactStreamParser({
      onChatText: (visible) => {
        if (!visible) return
        assembled += visible
        updatePost(activeScopeId, opts.postId, {
          content: assembled,
          streaming: true,
          citations: citations.length ? [...citations] : undefined,
          attachments: attachments.length ? [...attachments] : undefined,
          pendingApprovalId,
        })
      },
      onArtifactUpsert: (partial) => {
        upsertArtifact({ ...partial, pendingReview: true })
        setShowCanvas(true)
      },
    })
    while (true) {
      if (opts.signal?.aborted) {
        try {
          await reader.cancel()
        } catch {
          /* ignore */
        }
        artifactParser.flush()
        const stopped = (assembled || 'أُوقف التشغيل.') + (assembled ? '…' : '')
        updatePost(activeScopeId, opts.postId, {
          content: assembled ? `${assembled}\n\n— أُوقف التشغيل.` : 'أُوقف التشغيل.',
          streaming: false,
        })
        return stopped
      }
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() || ''
      for (const chunk of chunks) {
        for (const rawLine of chunk.split('\n')) {
          const line = rawLine.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try {
            const event = JSON.parse(payload) as {
              type?: string
              delta?: string
              text?: string
              output?: unknown
              result?: unknown
            }
            if (
              event.type === 'text-delta' ||
              typeof event.delta === 'string' ||
              (event.type === 'text' && typeof event.text === 'string')
            ) {
              artifactParser.push(String(event.delta ?? event.text ?? ''))
            }
            const toolOut =
              event.output ??
              event.result ??
              (event.type === 'tool-output-available' ? event.output : undefined)
            if (toolOut && typeof toolOut === 'object') {
              const out = toolOut as Record<string, unknown>
              const nested =
                out.output && typeof out.output === 'object'
                  ? (out.output as Record<string, unknown>)
                  : out
              const pausedId = extractPausedApprovalId(toolOut)
              if (pausedId) pendingApprovalId = pausedId
              for (const c of extractCitationsFromToolOutput(toolOut)) {
                if (!citations.some((x) => x.labelAr === c.labelAr)) {
                  citations.push(c)
                }
              }
              const attachList = (nested.attachments || out.attachments) as
                | RoomFileAttachment[]
                | undefined
              if (Array.isArray(attachList)) {
                for (const a of attachList) {
                  if (!a?.fileId || !a?.name) continue
                  if (attachments.some((x) => x.fileId === a.fileId)) continue
                  attachments.push({
                    fileId: String(a.fileId),
                    name: String(a.name),
                    mimeType: a.mimeType ? String(a.mimeType) : undefined,
                    scopeId: String(a.scopeId || activeScopeId),
                    downloadPath: a.downloadPath
                      ? String(a.downloadPath)
                      : undefined,
                  })
                }
              } else if (
                typeof nested.fileId === 'string' &&
                typeof nested.name === 'string' &&
                (nested.downloadPath || nested.downloadUrl || nested.ok)
              ) {
                const fileId = nested.fileId
                if (!attachments.some((x) => x.fileId === fileId)) {
                  attachments.push({
                    fileId,
                    name: nested.name,
                    mimeType:
                      typeof nested.mimeType === 'string'
                        ? nested.mimeType
                        : undefined,
                    scopeId: activeScopeId,
                    downloadPath: String(
                      nested.downloadPath || nested.downloadUrl || ''
                    ),
                  })
                }
              }
              updatePost(activeScopeId, opts.postId, {
                content: assembled,
                streaming: true,
                citations: citations.length ? [...citations] : undefined,
                attachments: attachments.length ? [...attachments] : undefined,
                pendingApprovalId,
              })
            }
          } catch {
            /* ignore */
          }
        }
      }
    }

    artifactParser.flush()

    const fileFooter =
      attachments.length > 0
        ? `\n\n${attachments
            .map((a) => `📎 ملف جاهز للتنزيل: ${a.name} (id:${a.fileId})`)
            .join('\n')}`
        : ''
    const finalContent =
      (assembled ||
        (pendingApprovalId
          ? 'الإجراء معلّق بانتظار موافقتك في قسم الموافقات.'
          : 'تعذّر بث الرد. تحقق من مفاتيح النماذج في الإعدادات.')) +
      (assembled ? fileFooter : '')

    updatePost(activeScopeId, opts.postId, {
      content: finalContent,
      streaming: false,
      citations: citations.length ? citations : undefined,
      attachments: attachments.length ? attachments : undefined,
      pendingApprovalId,
    })

    if (assembled || attachments.length) {
      await fetch('/api/rooms/posts', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId: activeScopeId,
          content: finalContent,
          authorKind: 'agent',
          authorId: opts.agent.id,
          authorNameAr: opts.agent.nameAr,
          mentionAgentId: opts.agent.id,
        }),
      })
    }
    return finalContent
  }

  async function sendPrompt() {
    const prompt = input.trim()
    if (!prompt || streaming) return
    if (isGuest) {
      // Keep the text so nothing the user typed disappears silently.
      setSendBlockedAr(
        'سجّل الدخول للإرسال — رسائل الغرفة والوكلاء تحتاج جلسة حقيقية.'
      )
      return
    }
    setSendBlockedAr('')
    setInput('')

    const headers = await authHeaders({
      'Content-Type': 'application/json',
    })

    // Note: JS \b does not work after Arabic tokens — match whitespace/end instead.
    const teamMention = prompt
      .trim()
      .match(/^@(all|team|الجميع|فريق)(?:\s+|$)/i)
    const wantsAll = Boolean(teamMention)
    const promptAfterTeam = wantsAll
      ? prompt.trim().slice(teamMention![0].length).trim() || prompt.trim()
      : prompt
    const handoff = resolveMentionHandoff(promptAfterTeam, agentCatalog)
    const runTeam =
      (collabMode === 'team' && !handoff.agent) || wantsAll
    const TEAM_RUN_CAP = 8
    const teamAgents = roomAgents.slice(0, TEAM_RUN_CAP)
    const agentsToRun: RoomAgent[] = runTeam
      ? teamAgents.length
        ? teamAgents
        : roomAgents[0]
          ? [roomAgents[0]]
          : []
      : [handoff.agent || roomAgents[0]].filter(Boolean) as RoomAgent[]

    if (agentsToRun.length === 0) {
      appendPost({
        id: `sys-${Date.now()}`,
        scopeId: activeScopeId,
        authorKind: 'system',
        authorId: 'system',
        authorNameAr: 'النظام',
        content: 'لا وكلاء في الغرفة — أضفهم من «إدارة الوكلاء».',
        createdAt: Date.now(),
      })
      return
    }

    const cleanPrompt = handoff.cleanPrompt || prompt
    const humanId = `h-${Date.now()}`

    const savedHuman = await fetch('/api/rooms/posts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: humanId,
        scopeId: activeScopeId,
        content: prompt,
        authorNameAr: displayName,
        mentionAgentId: runTeam ? undefined : agentsToRun[0]?.id,
      }),
    }).catch(() => null)

    if (savedHuman && !savedHuman.ok) {
      const failure = (await savedHuman.json().catch(() => ({}))) as {
        error?: string
        code?: string
      }
      if (savedHuman.status === 401 || failure.code === 'AUTH_REQUIRED') {
        setInput(prompt)
        setSendBlockedAr(
          'سجّل الدخول للإرسال — لم تُحفظ الرسالة في الغرفة.'
        )
        return
      }
      setSendBlockedAr(
        failure.error || 'لم تُحفظ الرسالة في الغرفة — أعد المحاولة.'
      )
    }

    appendPost({
      id: humanId,
      scopeId: activeScopeId,
      authorKind: 'human',
      authorId: 'me',
      authorNameAr: displayName,
      content: prompt,
      createdAt: Date.now(),
    })

    void broadcastRoomEdit(activeScopeId, {
      actorAr: displayName,
      actionAr: 'أرسل رسالة',
      detailAr: prompt.slice(0, 80),
      at: Date.now(),
    })

    runAbortRef.current?.abort()
    const abort = new AbortController()
    runAbortRef.current = abort
    setStreaming(true)
    setAnsweringAgentId(null)
    try {
      localStorage.setItem('ab-first-chat', '1')
      window.dispatchEvent(new Event('ab-first-chat'))
    } catch {
      /* ignore */
    }
    const peerNotes: string[] = []
    // Prior agent posts in the room (shared memory of what others did)
    const priorPeers = posts
      .filter((p) => p.authorKind === 'agent' && p.content)
      .slice(-6)
      .map((p) => `• ${p.authorNameAr}: ${p.content.slice(0, 400)}`)
    if (priorPeers.length) {
      peerNotes.push('من سجل الغرفة:\n' + priorPeers.join('\n'))
    }

    try {
      for (let i = 0; i < agentsToRun.length; i++) {
        if (abort.signal.aborted) break
        const agent = agentsToRun[i]
        setAnsweringAgentId(agent.id)
        const postId = `a-${Date.now()}-${i}`
        appendPost({
          id: postId,
          scopeId: activeScopeId,
          authorKind: 'agent',
          authorId: agent.id,
          authorNameAr: agent.nameAr,
          content: '',
          createdAt: Date.now() + i + 1,
          streaming: true,
        })
        const reply = await streamOneAgent({
          prompt: cleanPrompt,
          agent,
          peerContextAr:
            runTeam && peerNotes.length ? peerNotes.join('\n\n') : undefined,
          postId,
          headers,
          signal: abort.signal,
        })
        if (abort.signal.aborted) break
        if (runTeam) {
          peerNotes.push(`• ${agent.nameAr}: ${reply.slice(0, 800)}`)
        }
      }
      if (abort.signal.aborted) {
        appendPost({
          id: `stop-${Date.now()}`,
          scopeId: activeScopeId,
          authorKind: 'system',
          authorId: 'system',
          authorNameAr: 'النظام',
          content: 'أُوقف تشغيل الوكلاء.',
          createdAt: Date.now(),
        })
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        appendPost({
          id: `err-${Date.now()}`,
          scopeId: activeScopeId,
          authorKind: 'system',
          authorId: 'system',
          authorNameAr: 'النظام',
          content: 'حدث خطأ في الاتصال أثناء تشغيل الوكلاء.',
          createdAt: Date.now(),
        })
      }
    } finally {
      if (runAbortRef.current === abort) runAbortRef.current = null
      setStreaming(false)
      setAnsweringAgentId(null)
    }
  }

  async function sendOutboundTelegram() {
    const text = input.trim()
    if (!text) {
      setOutboundMsg('اكتب نصاً في الحقل ثم أرسل للقناة.')
      return
    }
    const res = await fetch('/api/rooms/outbound', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        scopeId: activeScopeId,
        textAr: text,
        channel: 'telegram',
      }),
    })
    const data = (await res.json()) as { noteAr?: string; error?: string }
    setOutboundMsg(
      res.ok
        ? data.noteAr || 'تم الإرسال'
        : data.error || data.noteAr || `فشل الإرسال (HTTP ${res.status})`
    )
  }

  function dismissOnboarding() {
    setShowOnboarding(false)
    try {
      localStorage.setItem('ab-onboarded', '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      dir="rtl"
      className={cn(
        'flex h-[calc(100dvh-2.75rem)] w-full ab-stage p-3 md:h-dvh',
        className
      )}
    >
      {!isCanvasFullscreen && (
        <section
          ref={chatColumnRef}
          className={cn(
            'relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-ab-border bg-ab-surface shadow-sm max-md:!w-full max-md:!flex-1 max-md:!basis-full',
            canvasOpen ? 'md:shrink-0' : 'w-full flex-1'
          )}
          style={
            canvasOpen
              ? {
                  width: `${Math.round((1 - splitRatio) * 100)}%`,
                  flexBasis: `${Math.round((1 - splitRatio) * 100)}%`,
                }
              : undefined
          }
          aria-label="غرفة العمل"
          onFocusCapture={() => setPresenceSurface('feed')}
        >
          {showOnboarding && (
            <div className="space-y-3 border-b border-ab-accent/20 bg-ab-accent/5 px-3 py-2.5">
              <FirstRunChecklist
                onNavigate={(section) => {
                  window.dispatchEvent(
                    new CustomEvent('ab-nav', { detail: section })
                  )
                }}
                onDismiss={dismissOnboarding}
              />
            </div>
          )}

          <header className="border-b border-ab-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-bold text-ab-ink">
                  {activeScope.nameAr}
                </h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <RoomPresenceBar
                    scopeId={activeScopeId}
                    typing={typing}
                    displayName={displayName}
                    surface={presenceSurface}
                    compact
                    agentTyping={streaming}
                    agentName={
                      answeringAgentId
                        ? roomAgents.find((a) => a.id === answeringAgentId)
                            ?.nameAr || 'الوكيل'
                        : 'الوكيل'
                    }
                  />
                  <ZoomLivePanel compact />
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <span className="inline-flex items-center gap-1">
                  <ModelPicker compact />
                  <HelpTip textAr="اختر نموذج الرد. يظهر فقط المزوّدون الذين لديهم مفتاح يعمل." />
                </span>
                {hasArtifacts && (
                  <button
                    type="button"
                    onClick={() => {
                      const mobile =
                        typeof window !== 'undefined' &&
                        window.matchMedia('(max-width: 767px)').matches
                      if (mobile) {
                        if (isCanvasFullscreen) {
                          toggleCanvasFullscreen()
                          setShowCanvas(false)
                        } else {
                          setShowCanvas(true)
                          toggleCanvasFullscreen()
                        }
                      } else {
                        setShowCanvas((v) => !v)
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-ab-border px-2 py-1 text-[11px] text-stone-600 hover:bg-stone-50"
                    aria-label={
                      canvasOpen || isCanvasFullscreen
                        ? 'إخفاء اللوحة'
                        : 'فتح اللوحة'
                    }
                  >
                    <PanelRightOpen className="h-3 w-3" />
                    {canvasOpen || isCanvasFullscreen ? 'إخفاء اللوحة' : 'اللوحة'}
                  </button>
                )}
                {shared && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMore((v) => {
                        const next = !v
                        if (next) {
                          const mobile =
                            typeof window !== 'undefined' &&
                            window.matchMedia('(max-width: 767px)').matches
                          const saved = readMembersPanePx(activeScopeId)
                          setMembersPanePx(
                            mobile
                              ? clampMembersPanePx(
                                  Math.max(
                                    saved,
                                    Math.round(window.innerHeight * 0.78)
                                  )
                                )
                              : saved
                          )
                          if (mobile) setSeatsCollapsed(true)
                        }
                        return next
                      })
                    }}
                    className="rounded-md border border-ab-border px-2 py-1 text-[11px] text-stone-600 hover:bg-stone-50"
                    aria-label="الأعضاء والسجل"
                    aria-expanded={showMore}
                  >
                    {showMore ? 'إخفاء' : 'الأعضاء'}
                  </button>
                )}
              </div>
            </div>
          </header>

          {showMore && shared && (
            <>
              {/* Mobile: near-full bottom sheet */}
              <div
                className="fixed inset-0 z-[55] bg-black/35 md:hidden"
                aria-hidden
                onClick={() => setShowMore(false)}
              />
              <div
                className="fixed inset-x-0 bottom-0 z-[56] flex flex-col rounded-t-2xl border border-ab-border bg-stone-50 shadow-xl md:hidden"
                style={{
                  height: membersPanePx,
                  maxHeight: '92dvh',
                  minHeight: MEMBERS_PANE_MIN,
                }}
                role="dialog"
                aria-label="الأعضاء والسجل"
              >
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="اسحب لتكبير أو تصغير قائمة الأعضاء"
                  title="اسحب لأعلى أو أسفل"
                  className="flex shrink-0 cursor-row-resize flex-col items-center gap-1 px-3 pb-1 pt-2 touch-none"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    const target = e.currentTarget
                    target.setPointerCapture(e.pointerId)
                    dragMembers.current = true
                    const startY = e.clientY
                    const startH = membersPanePx
                    const onMove = (ev: PointerEvent) => {
                      if (!dragMembers.current) return
                      // Drag up → taller sheet
                      setMembersPanePx(
                        clampMembersPanePx(startH + (startY - ev.clientY))
                      )
                    }
                    const onUp = (ev: PointerEvent) => {
                      dragMembers.current = false
                      try {
                        target.releasePointerCapture(ev.pointerId)
                      } catch {
                        /* ignore */
                      }
                      setMembersPanePx((h) => {
                        const next = clampMembersPanePx(h)
                        persistMembersPanePx(activeScopeId, next)
                        return next
                      })
                      window.removeEventListener('pointermove', onMove)
                      window.removeEventListener('pointerup', onUp)
                    }
                    window.addEventListener('pointermove', onMove)
                    window.addEventListener('pointerup', onUp)
                  }}
                >
                  <span className="h-1 w-12 rounded-full bg-stone-300" />
                  <div className="flex w-full items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold text-ab-ink">
                      الأعضاء والسجل
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowMore(false)}
                      className="rounded-md border border-ab-border bg-white px-2 py-1 text-[11px]"
                    >
                      إغلاق
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-4 pt-1">
                  <RoomTeamPanel scopeId={activeScopeId} />
                  <TelegramOutboundBlock
                    telegramReady={telegramReady}
                    outboundMsg={outboundMsg}
                    onSend={() => void sendOutboundTelegram()}
                  />
                </div>
              </div>

              {/* Desktop / tablet: inline resizable pane */}
              <div
                className="hidden shrink-0 flex-col border-b border-ab-border bg-stone-50 md:flex"
                style={{
                  height: membersPanePx,
                  minHeight: MEMBERS_PANE_MIN,
                }}
              >
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
                  <RoomTeamPanel scopeId={activeScopeId} />
                  <TelegramOutboundBlock
                    telegramReady={telegramReady}
                    outboundMsg={outboundMsg}
                    onSend={() => void sendOutboundTelegram()}
                  />
                </div>
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="اسحب لتكبير أو تصغير قائمة الأعضاء"
                  title="اسحب لأعلى أو أسفل لتغيير حجم قائمة الأعضاء"
                  className="group relative flex h-3 shrink-0 cursor-row-resize items-center justify-center touch-none"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    const target = e.currentTarget
                    target.setPointerCapture(e.pointerId)
                    dragMembers.current = true
                    const startY = e.clientY
                    const startH = membersPanePx
                    const onMove = (ev: PointerEvent) => {
                      if (!dragMembers.current) return
                      // Drag down → taller members pane
                      setMembersPanePx(
                        clampMembersPanePx(startH + (ev.clientY - startY))
                      )
                    }
                    const onUp = (ev: PointerEvent) => {
                      dragMembers.current = false
                      try {
                        target.releasePointerCapture(ev.pointerId)
                      } catch {
                        /* ignore */
                      }
                      setMembersPanePx((h) => {
                        const next = clampMembersPanePx(h)
                        persistMembersPanePx(activeScopeId, next)
                        return next
                      })
                      window.removeEventListener('pointermove', onMove)
                      window.removeEventListener('pointerup', onUp)
                    }
                    window.addEventListener('pointermove', onMove)
                    window.addEventListener('pointerup', onUp)
                  }}
                >
                  <span className="h-1.5 w-14 rounded-full bg-ab-border group-hover:bg-ab-accent" />
                  <span className="sr-only">اسحب لتغيير حجم القائمة</span>
                </div>
              </div>
            </>
          )}

          <div
            className="shrink-0 border-b border-ab-border/70 px-3 py-1.5"
            style={
              seatsCollapsed
                ? { maxHeight: 40, overflow: 'hidden' }
                : { maxHeight: seatsMaxPx, overflow: 'auto' }
            }
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] text-stone-500">مقاعد الوكلاء</span>
              <button
                type="button"
                className="rounded border border-ab-border px-1.5 py-0.5 text-[10px]"
                onClick={() => setSeatsCollapsed((v) => !v)}
              >
                {seatsCollapsed ? 'توسيع' : 'طي'}
              </button>
            </div>
            <AgentSeatsPanel
              scopeId={activeScopeId}
              activeAgentId={mentionPreview?.id}
              answeringAgentId={answeringAgentId}
              onSeatClick={(a) =>
                setInput((v) => (v.startsWith('@') ? v : `@${a.slug} ${v}`))
              }
            />
          </div>

          {!seatsCollapsed && (
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="اسحب لتكبير مقاعد الوكلاء أو الدردشة"
              title="اسحب لأعلى أو أسفل"
              className="group relative flex h-2.5 shrink-0 cursor-row-resize items-center justify-center touch-none"
              onPointerDown={(e) => {
                e.preventDefault()
                const target = e.currentTarget
                target.setPointerCapture(e.pointerId)
                dragChrome.current = true
                const startY = e.clientY
                const startH = seatsMaxPx
                const onMove = (ev: PointerEvent) => {
                  if (!dragChrome.current) return
                  setSeatsMaxPx(clampSeatsPx(startH + (ev.clientY - startY)))
                }
                const onUp = (ev: PointerEvent) => {
                  dragChrome.current = false
                  try {
                    target.releasePointerCapture(ev.pointerId)
                  } catch {
                    /* ignore */
                  }
                  setSeatsMaxPx((h) => {
                    const next = clampSeatsPx(h)
                    persistSeatsPx(activeScopeId, next)
                    return next
                  })
                  window.removeEventListener('pointermove', onMove)
                  window.removeEventListener('pointerup', onUp)
                }
                window.addEventListener('pointermove', onMove)
                window.addEventListener('pointerup', onUp)
              }}
            >
              <span className="h-0.5 w-10 rounded-full bg-ab-border group-hover:bg-ab-accent" />
            </div>
          )}

          <div ref={feedRef} className="flex-1 overflow-y-auto px-3 py-3">
            <div className="mx-auto w-full max-w-2xl">
              {posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
                  <MessageSquare
                    className="mb-2 h-7 w-7 text-stone-300"
                    aria-hidden
                  />
                  <p className="text-sm font-semibold text-ab-ink">
                    ابدأ المحادثة
                  </p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-stone-500">
                    {isGuest
                      ? 'سجّل الدخول للكتابة والإرسال. المعاينة للقراءة فقط.'
                      : 'اكتب مهمة أو تكلم بالميكروفون. وجّه بـ @اسم أو @الجميع.'}
                  </p>
                  {!isGuest && (
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setInput('لخّص قرارات هذا الأسبوع بالعربية الفصحى')
                        }
                        className="rounded-md border border-ab-border bg-white px-3 py-1.5 text-[11px] hover:bg-stone-50"
                      >
                        ملخص قرارات
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setInput('ابحث في معرفة الفريق عن سياسة الموافقات')
                        }
                        className="rounded-md border border-ab-border bg-white px-3 py-1.5 text-[11px] hover:bg-stone-50"
                      >
                        ابحث في المعرفة
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                posts.map((post) => <RoomPostCard key={post.id} post={post} />)
              )}
            </div>
          </div>

          <footer className="sticky bottom-0 border-t border-ab-border bg-ab-surface/95 p-2.5 backdrop-blur">
            {mentionPreview && (
              <p className="mb-1.5 text-[11px] text-ab-accent">
                سيتم توجيه الرد إلى {mentionPreview.nameAr}
              </p>
            )}
            {!mentionPreview &&
              !isGuest &&
              collabMode === 'team' &&
              roomAgents.length > 1 && (
              <p className="mb-1.5 text-[11px] text-stone-500">
                وضع تعاون: سيرد حتى{' '}
                {Math.min(8, roomAgents.length)} وكلاء بالتتابع ويتبادلون
                الملاحظات — أو @الجميع / @اسم لوكيل واحد
              </p>
            )}
            {micNote && (
              <p
                className="mb-1.5 rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-[11px] leading-snug text-stone-700"
                role="status"
              >
                {micNote}
              </p>
            )}
            {(isGuest || sendBlockedAr) && (
              <div
                className="mb-1.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2"
                role="alert"
              >
                <p className="text-[11px] font-medium leading-snug text-amber-950">
                  {sendBlockedAr ||
                    'سجّل الدخول للإرسال — المعاينة للقراءة فقط، ولا تُحفظ الرسائل.'}
                </p>
                <Link
                  href="/auth/login"
                  className="shrink-0 rounded-md bg-ab-accent px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  سجّل الدخول
                </Link>
              </div>
            )}
            <form
              className="flex items-end gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                void sendPrompt()
              }}
              onFocusCapture={() => setPresenceSurface('composer')}
            >
              <LocalUploadPanel scopeId={activeScopeId} compact />
              <ComposerMicButton
                disabled={streaming || isGuest}
                composerValue={input}
                onStatus={(msg) => setMicNote(msg)}
                onPartial={(draft) => {
                  setInput(draft)
                  setMicNote('يكتب من الصوت… النص يظهر في المربع — اضغط للإيقاف ثم راجع')
                }}
                onTranscript={(text, meta) => {
                  setInput(text)
                  setMicNote(
                    meta?.providerLabelAr
                      ? `نُسخ عبر ${meta.providerLabelAr} — صحّح في المربع إن لزم ثم أرسل`
                      : 'النص في المربع — صحّح إن لزم ثم أرسل'
                  )
                  requestAnimationFrame(() => {
                    composerRef.current?.focus()
                    const el = composerRef.current
                    if (el) {
                      el.selectionStart = el.value.length
                      el.selectionEnd = el.value.length
                    }
                  })
                }}
              />
              <textarea
                ref={composerRef}
                value={input}
                rows={Math.min(4, Math.max(1, input.split('\n').length))}
                onChange={(e) => {
                  setInput(e.target.value)
                  setTyping(true)
                  if (typingTimer.current) clearTimeout(typingTimer.current)
                  typingTimer.current = setTimeout(() => setTyping(false), 1200)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendPrompt()
                  }
                }}
                disabled={streaming || isGuest}
                placeholder={
                  isGuest
                    ? 'سجّل الدخول للإرسال…'
                    : collabMode === 'team'
                      ? 'مهمة للفريق… أو @اسم لوكيل واحد · @all للجميع'
                      : shared
                        ? 'اكتب أو تكلم بالميك… وجّه بـ @اسم الوكيل'
                        : activeScopeId === 'personal-research'
                          ? 'اكتب أو تكلم بالميك… جرّب @research'
                          : 'اكتب أو تكلم بالميك…'
                }
                className="max-h-28 min-h-[2.5rem] min-w-0 flex-1 resize-none rounded-xl border border-ab-border bg-white px-3 py-2.5 text-sm outline-none ring-ab-accent focus:ring-2 disabled:opacity-50"
                aria-label="رسالة الغرفة"
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={stopAgentRun}
                  className="h-10 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700"
                >
                  إيقاف
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || isGuest}
                  title={isGuest ? 'سجّل الدخول للإرسال' : undefined}
                  className="h-10 shrink-0 rounded-xl bg-ab-accent px-4 text-sm font-semibold text-white disabled:opacity-40"
                >
                  إرسال
                </button>
              )}
            </form>
          </footer>
        </section>
      )}

      {canvasOpen && !isCanvasFullscreen && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="اسحب لتكبير الدردشة أو اللوحة"
          title="اسحب يميناً/يساراً لتكبير الدردشة أو اللوحة"
          className="mx-0.5 hidden w-2.5 shrink-0 cursor-col-resize items-stretch rounded-full bg-ab-border/80 hover:bg-ab-accent md:flex"
          onMouseDown={() => {
            dragSplit.current = true
            const onMove = (e: MouseEvent) => {
              if (!dragSplit.current) return
              const stage = feedRef.current?.closest(
                '.ab-stage'
              ) as HTMLElement | null
              const rect = stage?.getBoundingClientRect()
              if (!rect) return
              const x = e.clientX - rect.left
              const canvasShare = x / rect.width
              setSplitRatio(Math.min(0.85, Math.max(0.35, canvasShare)))
            }
            const onUp = () => {
              dragSplit.current = false
              window.removeEventListener('mousemove', onMove)
              window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
          }}
        />
      )}

      {canvasOpen && (
        <section
          className={cn(
            'min-w-0 overflow-hidden rounded-xl border border-ab-border bg-ab-surface shadow-sm max-md:!w-full max-md:!basis-full',
            isCanvasFullscreen
              ? 'flex flex-1 flex-col'
              : 'hidden md:flex md:flex-col md:shrink-0'
          )}
          style={
            !isCanvasFullscreen
              ? {
                  width: `${Math.round(splitRatio * 100)}%`,
                  flexBasis: `${Math.round(splitRatio * 100)}%`,
                }
              : undefined
          }
          aria-label="لوحة المخرجات"
          onFocusCapture={() => setPresenceSurface('canvas')}
        >
          <CanvasWorkspace
            scopeId={activeScopeId}
            displayName={displayName}
            onSurfaceChange={setPresenceSurface}
            onClose={() => {
              if (isCanvasFullscreen) toggleCanvasFullscreen()
              else setShowCanvas(false)
            }}
            onPersist={async (artifact) => {
              const res = await fetch('/api/rooms/canvas', {
                method: 'POST',
                headers: await authHeaders({
                  'Content-Type': 'application/json',
                }),
                body: JSON.stringify({
                  id: artifact.id,
                  scopeId: activeScopeId,
                  type: artifact.type,
                  titleAr: artifact.titleAr,
                  content: artifact.content,
                  language: artifact.language,
                  updatedBy: displayName,
                }),
              })
              if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as {
                  error?: string
                }
                throw new Error(data.error || `فشل الحفظ (HTTP ${res.status})`)
              }
              void broadcastRoomEdit(activeScopeId, {
                id: `canvas-${artifact.id}-${Date.now()}`,
                actorAr: displayName,
                actionAr: 'عدّل اللوحة',
                detailAr: artifact.titleAr,
                at: Date.now(),
              })
            }}
          />
        </section>
      )}
    </div>
  )
}

function TelegramOutboundBlock({
  telegramReady,
  outboundMsg,
  onSend,
}: {
  telegramReady: boolean
  outboundMsg: string
  onSend: () => void
}) {
  return (
    <div className="rounded-md border border-dashed border-ab-border bg-white p-2">
      <p className="mb-1.5 text-[11px] font-semibold text-ab-ink">
        تنبيه تيليجرام
      </p>
      <p className="mb-2 text-[10px] text-stone-500">
        يرسل نص الحقل الحالي إلى شات تيليجرام المضبوط — لا يضيف أحداً للغرفة.
      </p>
      {!telegramReady ? (
        <p className="text-[10px] text-stone-500">
          تيليجرام غير مفعّل — افتح الإعدادات لربط البوت.
        </p>
      ) : (
        <button
          type="button"
          onClick={onSend}
          className="rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs"
        >
          إرسال تنبيه
        </button>
      )}
      {outboundMsg && (
        <p className="mt-1.5 text-[10px] text-stone-500">{outboundMsg}</p>
      )}
    </div>
  )
}
