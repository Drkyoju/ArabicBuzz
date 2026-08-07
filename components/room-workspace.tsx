'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PanelRightOpen, MessageSquare, Eye } from 'lucide-react'
import { RoomPostCard } from '@/components/room-post'
import { CanvasWorkspace } from '@/components/canvas/canvas-workspace'
import { FilePreviewPane } from '@/components/file-preview-pane'
import { ComposerMicButton } from '@/components/composer-mic-button'
import { useCanvasStore } from '@/lib/canvas/store'
import { useFilePreviewStore } from '@/lib/files/preview-store'
import {
  AB_ATTACH_ROOM,
  consumePendingRoomAttach,
} from '@/lib/files/workspace-bridge'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'
import {
  createBrowserSupabaseClient,
  getBrowserSession,
  isSupabaseConfigured,
  authHeaders,
} from '@/lib/supabase/browser'
import { isSharedScope } from '@/lib/scopes/manager'
import {
  PRIMARY_TEAM_SCOPE_ID,
  shouldRedirectToPrimary,
} from '@/lib/scopes/primary-room'
import {
  hydrateScopeMemories,
  useWorkspaceStore,
} from '@/lib/scopes/workspace-store'
import {
  LocalUploadPanel,
  type UploadedRoomFile,
} from '@/components/local-upload-panel'
import { RoomPresenceBar, broadcastRoomEdit } from '@/components/room-presence'
import { ZoomLivePanel } from '@/components/zoom-live-panel'
import { AgentSeatsPanel } from '@/components/agent-seats-panel'
import { AgentsManagePanel } from '@/components/agents-manage-panel'
import { AgentsWorkingToggle } from '@/components/agents-working-toggle'
import { FirstRunChecklist } from '@/components/first-run-checklist'
import { RoomTeamPanel } from '@/components/room-team-panel'
import { ModelPicker } from '@/components/model-picker'
import { EffortPicker } from '@/components/effort-picker'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceModeStore } from '@/lib/scopes/workspace-mode-store'
import { useSecurityPostureStore } from '@/lib/security/posture-store'
import { isNoiseRoomPost } from '@/lib/rooms/noise'
import { resolveMentionHandoff, type RoomAgent } from '@/lib/rooms/agents'
import {
  memberMentionToken,
  type MentionableMember,
} from '@/lib/rooms/member-mentions'
import { useAgentRosterStore } from '@/lib/rooms/agent-roster-store'
import { useRosterCloudSync } from '@/lib/rooms/use-roster-cloud-sync'
import {
  ASSISTANT_PARALLEL_DEFAULT,
  ROOM_TEAM_RUN_CAP,
} from '@/lib/assistants/parallel'
import { usesSharedRoomRoster } from '@/lib/rooms/roster-scope'
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

const MEMBERS_PANE_MIN = 160
const SEATS_MIN = 72
const SEATS_MAX = 360
const SEATS_DEFAULT = 160

function clampMembersPanePx(px: number): number {
  const vh =
    typeof window !== 'undefined' ? window.innerHeight : 800
  // Leave most of the column for chat; drag handle can enlarge.
  const max = Math.round(vh * 0.72)
  return Math.min(max, Math.max(MEMBERS_PANE_MIN, Math.round(px)))
}

function defaultMembersPanePx(): number {
  const vh =
    typeof window !== 'undefined' ? window.innerHeight : 800
  // Compact default — chat stays readable; user can drag taller.
  return clampMembersPanePx(Math.round(vh * 0.28))
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
  const resolveModelPrefs = useModelPickerStore((s) => s.resolveForScope)
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
  const [showCanvas, setShowCanvas] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [micNote, setMicNote] = useState('')
  const [sendBlockedAr, setSendBlockedAr] = useState('')
  const [presenceSurface, setPresenceSurface] = useState('feed')
  /** Files attached from device / preview for the next agent turn. */
  const [composerFiles, setComposerFiles] = useState<UploadedRoomFile[]>([])
  const [mentionMembers, setMentionMembers] = useState<MentionableMember[]>([])
  const [mentionMenu, setMentionMenu] = useState<
    Array<{ kind: 'agent' | 'member'; labelAr: string; insert: string }>
  >([])
  const prevArtifactCount = useRef(0)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const runAbortRef = useRef<AbortController | null>(null)

  function attachComposerFile(file: UploadedRoomFile) {
    setComposerFiles((prev) => {
      if (prev.some((f) => f.fileId === file.fileId)) return prev
      return [...prev, file]
    })
  }

  function detachComposerFile(fileId: string) {
    setComposerFiles((prev) => prev.filter((f) => f.fileId !== fileId))
  }
  const signedIn = useSignedIn()
  const canAccessOpsUi = useWorkspaceModeStore((s) => s.canAccessOpsUi)
  const isGuest = signedIn === false
  useRosterCloudSync()
  const posture = useSecurityPostureStore((s) => s.posture)
  const hasArtifacts = artifacts.length > 0
  const previewOpen = useFilePreviewStore((s) => s.open)
  const previewFile = useFilePreviewStore((s) => s.file)
  const notifyFileReady = useFilePreviewStore((s) => s.notifyFileReady)
  const closePreview = useFilePreviewStore((s) => s.closePreview)
  const [sideTab, setSideTab] = useState<'file' | 'canvas'>('file')
  const canvasOpen = isCanvasFullscreen || (showCanvas && hasArtifacts)
  const sidePanelOpen =
    previewOpen || canvasOpen || (showCanvas && hasArtifacts)

  const agentsForScopeFn = useAgentRosterStore((s) => s.agentsForScope)
  const allAgentsFn = useAgentRosterStore((s) => s.allAgents)
  const collabMode = useAgentRosterStore(
    (s) => s.collabModeByScope[activeScopeId] || 'solo'
  )
  const agentsWorking = useAgentRosterStore(
    (s) => s.agentsEnabledByScope[activeScopeId] !== false
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
      if (!previewOpen) setSideTab('canvas')
    }
    prevArtifactCount.current = artifacts.length
  }, [artifacts.length, previewOpen])

  // Prefer file tab when preview opens
  useEffect(() => {
    if (previewOpen) setSideTab('file')
  }, [previewOpen])

  // Shared rooms: keep activity collapsed by default so chat stays primary
  useEffect(() => {
    setShowMore(false)
    setMembersPanePx(readMembersPanePx(activeScopeId))
    setSeatsMaxPx(readSeatsPx(activeScopeId))
    // Mobile: seats always start collapsed so they don't eat the chat.
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 767px)').matches
    ) {
      setSeatsCollapsed(true)
    }
  }, [activeScopeId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = () => {
      if (mq.matches) setSeatsCollapsed(true)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

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
        // Restore scope only if still a known id (don't clobber a brand-new session).
        // Old clutter demo rooms redirect to the primary team room.
        const scope = localStorage.getItem('ab-active-scope')
        if (scope) {
          if (shouldRedirectToPrimary(scope)) {
            setActiveScopeId(PRIMARY_TEAM_SCOPE_ID)
          } else {
            const known = useWorkspaceStore
              .getState()
              .scopes.some((s) => s.id === scope)
            if (known) setActiveScopeId(scope)
          }
        }
      } catch {
        /* ignore */
      }
      setDisplayName(String(name))
    })
    hydrateScopeMemories()
    // Restore active scope after hydrate (custom rooms may now be known)
    try {
      const scope = localStorage.getItem('ab-active-scope')
      if (scope) {
        const known = useWorkspaceStore.getState().scopes.some((s) => s.id === scope)
        if (known) setActiveScopeId(scope)
      }
    } catch {
      /* ignore */
    }
    return () => {
      cancelled = true
    }
  }, [setActiveScopeId])

  // Sync membership rooms into sidebar (association / invites survive reload)
  useEffect(() => {
    if (signedIn !== true) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/rooms/mine', {
          headers: await authHeaders(),
        })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          rooms?: { scopeId: string; nameAr?: string; kind?: 'personal' | 'shared' }[]
        }
        if (data.rooms?.length) {
          useWorkspaceStore.getState().syncRemoteRooms(data.rooms)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn])

  // When preview opens from files panel, attach that file for the next send
  useEffect(() => {
    function onPreview(e: Event) {
      const detail = (e as CustomEvent<UploadedRoomFile>).detail
      if (!detail?.fileId) return
      if (detail.scopeId && detail.scopeId !== activeScopeId) return
      attachComposerFile({
        fileId: detail.fileId,
        name: detail.name || detail.fileId,
        mimeType: detail.mimeType,
        scopeId: detail.scopeId || activeScopeId,
      })
    }
    window.addEventListener('ab-file-preview', onPreview)
    return () => window.removeEventListener('ab-file-preview', onPreview)
  }, [activeScopeId])

  // Telegram / assistants bridge → attach to room composer
  useEffect(() => {
    function applyBridge(detail: {
      fileId: string
      name?: string
      mimeType?: string
      scopeId?: string
    }) {
      if (!detail?.fileId) return
      if (detail.scopeId && detail.scopeId !== activeScopeId) return
      attachComposerFile({
        fileId: detail.fileId,
        name: detail.name || detail.fileId,
        mimeType: detail.mimeType,
        scopeId: detail.scopeId || activeScopeId,
      })
    }
    function onRoomAttach(e: Event) {
      applyBridge((e as CustomEvent).detail || {})
    }
    window.addEventListener(AB_ATTACH_ROOM, onRoomAttach)
    const pending = consumePendingRoomAttach()
    if (pending) applyBridge(pending)
    return () => window.removeEventListener(AB_ATTACH_ROOM, onRoomAttach)
  }, [activeScopeId])

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
    setComposerFiles([])
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
        const cleaned = data.posts.filter((p) => !isNoiseRoomPost(p.content || ''))
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
          if (isNoiseRoomPost(row.content || '')) return
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
            postKind:
              row.post_kind === 'decision' || row.post_kind === 'minutes'
                ? row.post_kind
                : 'chat',
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

  const shared = activeScope ? isSharedScope(activeScope) : false
  const { agent: mentionPreview } = resolveMentionHandoff(input, agentCatalog)

  useEffect(() => {
    if (signedIn !== true || !shared) {
      setMentionMembers([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/rooms/members?scopeId=${encodeURIComponent(activeScopeId)}`,
          { headers: await authHeaders() }
        )
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          members?: Array<{
            userId: string | null
            email: string | null
            displayNameAr: string
          }>
        }
        setMentionMembers(
          (data.members || []).map((m) => ({
            userId: m.userId,
            email: m.email,
            displayNameAr: m.displayNameAr,
            mentionToken: memberMentionToken(m.displayNameAr),
          }))
        )
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeScopeId, signedIn, shared])

  function refreshMentionMenu(value: string) {
    const m = value.match(/@([\u0600-\u06FFa-zA-Z0-9_\-]*)$/)
    if (!m) {
      setMentionMenu([])
      return
    }
    const q = m[1].toLowerCase()
    const agentItems = agentCatalog
      .filter(
        (a) =>
          !q ||
          a.slug.toLowerCase().includes(q) ||
          a.nameAr.includes(m[1]) ||
          a.nameAr.replace(/\s+/g, '').includes(m[1])
      )
      .slice(0, 5)
      .map((a) => ({
        kind: 'agent' as const,
        labelAr: `${a.nameAr} · وكيل`,
        insert: a.slug,
      }))
    const memberItems = mentionMembers
      .filter(
        (mem) =>
          !q ||
          mem.mentionToken.toLowerCase().includes(q) ||
          mem.displayNameAr.includes(m[1])
      )
      .slice(0, 5)
      .map((mem) => ({
        kind: 'member' as const,
        labelAr: `${mem.displayNameAr} · عضو`,
        insert: mem.mentionToken,
      }))
    setMentionMenu([...agentItems, ...memberItems].slice(0, 8))
  }

  function applyMentionInsert(token: string) {
    setInput((prev) =>
      prev.replace(/@([\u0600-\u06FFa-zA-Z0-9_\-]*)$/, `@${token} `)
    )
    setMentionMenu([])
    composerRef.current?.focus()
  }

  if (!activeScope) {
    return (
      <div className="p-8 text-sm text-stone-500" dir="rtl">
        اختر مساحة من الشريط الجانبي.
      </div>
    )
  }

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
    attachedFiles?: UploadedRoomFile[]
  }): Promise<string> {
    if (opts.signal?.aborted) {
      updatePost(activeScopeId, opts.postId, {
        content: 'أُوقف التشغيل.',
        streaming: false,
      })
      return 'أُوقف التشغيل.'
    }

    const { model: roomModel, effort: roomEffort } =
      resolveModelPrefs(activeScopeId)

    let res: Response
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: opts.headers,
        signal: opts.signal,
        body: JSON.stringify({
          prompt: opts.prompt,
          // Room ModelPicker is the run control; agent preferredModel is fallback only.
          modelId: roomModel || opts.agent.preferredModel,
          effortLevel: roomEffort,
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
          attachedFiles: (opts.attachedFiles || []).map((f) => ({
            fileId: f.fileId,
            name: f.name,
            mimeType: f.mimeType,
          })),
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
                  const att: RoomFileAttachment = {
                    fileId: String(a.fileId),
                    name: String(a.name),
                    mimeType: a.mimeType ? String(a.mimeType) : undefined,
                    scopeId: String(a.scopeId || activeScopeId),
                    downloadPath: a.downloadPath
                      ? String(a.downloadPath)
                      : undefined,
                    edited: Boolean(
                      a.edited ||
                        nested.replaced ||
                        nested.versionTag ||
                        nested.editMode
                    ),
                  }
                  attachments.push(att)
                  notifyFileReady({
                    fileId: att.fileId,
                    scopeId: att.scopeId,
                    name: att.name,
                    mimeType: att.mimeType,
                  })
                }
              } else if (
                typeof nested.fileId === 'string' &&
                typeof nested.name === 'string' &&
                (nested.downloadPath || nested.downloadUrl || nested.ok)
              ) {
                const fileId = nested.fileId
                if (!attachments.some((x) => x.fileId === fileId)) {
                  const att: RoomFileAttachment = {
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
                    edited: Boolean(
                      nested.edited ||
                        nested.replaced ||
                        nested.versionTag ||
                        nested.editMode
                    ),
                  }
                  attachments.push(att)
                  notifyFileReady({
                    fileId: att.fileId,
                    scopeId: att.scopeId,
                    name: att.name,
                    mimeType: att.mimeType,
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
          ? 'الإجراء معلّق بانتظار موافقتك — سيظهر تنبيه أعلى الصفحة وصندوق الموافقات.'
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

  async function sendPrompt(overridePrompt?: string) {
    const filesForSend = [...composerFiles]
    const typed = (overridePrompt ?? input).trim()
    const prompt =
      typed ||
      (filesForSend.length
        ? `عدّل الملف المرفق «${filesForSend[0].name}» وفق طلب العمل وأعد نسخة قابلة للتنزيل في الشات.`
        : '')
    if ((!prompt && !filesForSend.length) || streaming) return
    if (isGuest) {
      // Keep the text so nothing the user typed disappears silently.
      setSendBlockedAr(
        'سجّل الدخول للإرسال — رسائل الغرفة والوكلاء تحتاج جلسة حقيقية.'
      )
      return
    }
    setSendBlockedAr('')
    setInput('')
    setComposerFiles([])

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
    const teamAgents = roomAgents.slice(0, ROOM_TEAM_RUN_CAP)
    const agentsToRun: RoomAgent[] = agentsWorking
      ? runTeam
        ? teamAgents.length
          ? teamAgents
          : roomAgents[0]
            ? [roomAgents[0]]
            : []
        : ([handoff.agent || roomAgents[0]].filter(Boolean) as RoomAgent[])
      : []
    const teamParallel = Math.min(
      ASSISTANT_PARALLEL_DEFAULT,
      agentsToRun.length || 1
    )

    const cleanPrompt = handoff.cleanPrompt || prompt
    const humanId = `h-${Date.now()}`
    const fileNote =
      filesForSend.length > 0
        ? `\n\n📎 مرفق للتعديل: ${filesForSend
            .map((f) => `«${f.name}» (id:${f.fileId})`)
            .join(' · ')}`
        : ''
    const humanContent = `${prompt}${fileNote}`

    const savedHuman = await fetch('/api/rooms/posts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: humanId,
        scopeId: activeScopeId,
        content: humanContent,
        authorNameAr: displayName,
        mentionAgentId:
          agentsWorking && !runTeam ? agentsToRun[0]?.id : undefined,
      }),
    }).catch(() => null)

    if (savedHuman && !savedHuman.ok) {
      const failure = (await savedHuman.json().catch(() => ({}))) as {
        error?: string
        code?: string
      }
      if (savedHuman.status === 401 || failure.code === 'AUTH_REQUIRED') {
        setInput(typed)
        setComposerFiles(filesForSend)
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
      content: humanContent,
      createdAt: Date.now(),
      attachments: filesForSend.map((f) => ({
        fileId: f.fileId,
        name: f.name,
        mimeType: f.mimeType,
        scopeId: f.scopeId,
      })),
    })

    void broadcastRoomEdit(activeScopeId, {
      actorAr: displayName,
      actionAr: agentsWorking ? 'أرسل رسالة' : 'أضاف ملاحظة',
      detailAr: prompt.slice(0, 80),
      at: Date.now(),
    })

    // Humans-only mode: save the note/chat and stop — no agent replies.
    if (!agentsWorking) {
      try {
        localStorage.setItem('ab-first-chat', '1')
        window.dispatchEvent(new Event('ab-first-chat'))
      } catch {
        /* ignore */
      }
      return
    }

    if (agentsToRun.length === 0) {
      appendPost({
        id: `sys-${Date.now()}`,
        scopeId: activeScopeId,
        authorKind: 'system',
        authorId: 'system',
        authorNameAr: 'النظام',
        content:
          'لا وكلاء في الغرفة — أضفهم من «إدارة الوكلاء»، أو أبقِ الوضع «بشر فقط».',
        createdAt: Date.now(),
      })
      return
    }

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
    // Prior agent posts in the room (shared context for parallel team fan-out)
    const priorPeers = posts
      .filter((p) => p.authorKind === 'agent' && p.content)
      .slice(-6)
      .map((p) => `• ${p.authorNameAr}: ${p.content.slice(0, 400)}`)
    const peerContextAr = priorPeers.length
      ? `من سجل الغرفة:\n${priorPeers.join('\n')}`
      : undefined

    try {
      let cursor = 0
      const workers = Array.from(
        { length: Math.min(teamParallel, agentsToRun.length) },
        async () => {
          while (!abort.signal.aborted) {
            const i = cursor++
            if (i >= agentsToRun.length) return
            const agent = agentsToRun[i]
            setAnsweringAgentId(agent.id)
            const postId = `a-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`
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
            await streamOneAgent({
              prompt: cleanPrompt,
              agent,
              peerContextAr: runTeam ? peerContextAr : undefined,
              postId,
              headers,
              signal: abort.signal,
              attachedFiles: filesForSend,
            })
          }
        }
      )
      await Promise.all(workers)
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
        'flex h-[calc(100dvh-2.75rem)] w-full ab-stage p-2 md:h-dvh md:p-3',
        className
      )}
    >
      {!isCanvasFullscreen && (
        <section
          ref={chatColumnRef}
          className={cn(
            'relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-ab-border bg-ab-surface shadow-sm max-md:!w-full max-md:!flex-1 max-md:!basis-full',
            sidePanelOpen ? 'md:shrink-0' : 'w-full flex-1'
          )}
          style={
            sidePanelOpen
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

          <header className="border-b border-ab-border bg-white/80 px-3 py-2 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-bold tracking-tight text-ab-ink">
                  {activeScope.nameAr}
                </h2>
                <p className="mt-0.5 truncate text-[11px] text-stone-500">
                  {shared
                    ? 'محادثة الفريق والوكلاء بـ @ — اسحب الفاصل لتكبير الدردشة'
                    : 'مساحتك الخاصة للمسودات والملفات — قبل مشاركة الفريق'}
                </p>
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
              <div className="ab-toolbar shrink-0 justify-end">
                <AgentsWorkingToggle scopeId={activeScopeId} compact />
                <ModelPicker compact scopeId={activeScopeId} />
                <EffortPicker compact scopeId={activeScopeId} />
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
                          setSideTab('canvas')
                          toggleCanvasFullscreen()
                        }
                      } else {
                        setShowCanvas((v) => !v)
                        setSideTab('canvas')
                      }
                    }}
                    className="ab-btn-secondary !py-1 text-[11px]"
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
                {previewOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      closePreview()
                    }}
                    className="ab-btn-accent-soft !py-1 text-[11px]"
                    aria-label="إغلاق معاينة الملف"
                  >
                    <Eye className="h-3 w-3" />
                    إغلاق المعاينة
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
                    className="ab-btn-secondary !py-1 text-[11px]"
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
              {/* Mobile: near-full bottom sheet — above sticky chat composer */}
              <div
                className="fixed inset-0 z-[65] bg-black/35 md:hidden"
                aria-hidden
                onClick={() => setShowMore(false)}
              />
              <div
                className="fixed inset-x-0 bottom-0 z-[66] flex flex-col rounded-t-2xl border border-ab-border bg-stone-50 shadow-xl md:hidden"
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

              {/* Desktop / tablet: inline pane above sticky composer so «نسخ» stays clickable */}
              <div
                className="relative z-30 hidden shrink-0 flex-col overflow-hidden border-b border-ab-border bg-stone-50 md:flex"
                style={{
                  height: membersPanePx,
                  minHeight: MEMBERS_PANE_MIN,
                }}
              >
                <div className="relative z-30 min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2 pointer-events-auto">
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
                  <span className="pointer-events-none absolute inset-x-0 -bottom-3 text-center text-[9px] text-stone-400 opacity-0 group-hover:opacity-100">
                    اسحب لتغيير الحجم
                  </span>
                  <span className="sr-only">اسحب لتغيير حجم القائمة</span>
                </div>
              </div>
            </>
          )}

          <div className="relative z-[1] shrink-0 border-b border-ab-border/70 px-3 py-1.5">
            {!agentsWorking ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-stone-600">
                  وضع بشر فقط — محادثة وملاحظات الفريق بلا ردود وكلاء.
                </p>
                <AgentsWorkingToggle scopeId={activeScopeId} compact />
              </div>
            ) : seatsCollapsed ? (
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] text-ab-muted">
                  مقاعد الوكلاء
                  {roomAgents.length > 0 ? (
                    <span className="text-ab-muted-soft">
                      {' '}
                      · {roomAgents.length}
                    </span>
                  ) : null}
                  {answeringAgentId ? (
                    <span className="ms-1 text-ab-accent">· يجيب…</span>
                  ) : null}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {canAccessOpsUi ? (
                    <AgentsManagePanel scopeId={activeScopeId} compact />
                  ) : null}
                  <button
                    type="button"
                    className="ab-btn-ghost !px-2 !py-0.5 text-[10px]"
                    onClick={() => setSeatsCollapsed(false)}
                  >
                    توسيع
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ maxHeight: seatsMaxPx, overflow: 'auto' }}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-ab-muted">
                    مقاعد الوكلاء
                  </span>
                  <button
                    type="button"
                    className="ab-btn-ghost !px-2 !py-0.5 text-[10px]"
                    onClick={() => setSeatsCollapsed(true)}
                  >
                    طي
                  </button>
                </div>
                <AgentSeatsPanel
                  scopeId={activeScopeId}
                  activeAgentId={mentionPreview?.id}
                  answeringAgentId={answeringAgentId}
                  onSeatClick={(a) =>
                    setInput((v) =>
                      v.startsWith('@') ? v : `@${a.slug} ${v}`
                    )
                  }
                />
              </div>
            )}
          </div>

          {agentsWorking && !seatsCollapsed && (
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

          <div
            ref={feedRef}
            className="relative z-0 min-h-0 flex-1 overflow-y-auto px-3 py-3"
          >
            <div className="mx-auto w-full max-w-2xl">
              {posts.length === 0 ? (
                <div className="ab-empty mx-auto my-4 max-w-md !py-8">
                  <MessageSquare
                    className="mb-2.5 h-8 w-8 text-ab-accent/45"
                    aria-hidden
                  />
                  <p className="text-sm font-bold text-ab-ink">
                    ابدأ المحادثة
                  </p>
                  <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-ab-muted">
                    {isGuest
                      ? 'سجّل الدخول للكتابة والإرسال. المعاينة للقراءة فقط.'
                      : 'اكتب مهمة أو تكلم بالميكروفون. وجّه بـ @اسم أو @الجميع.'}
                  </p>
                  {!isGuest && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        disabled={streaming}
                        onClick={() =>
                          void sendPrompt(
                            'لخّص قرارات وأعمال هذا الأسبوع بالعربية الفصحى في نقاط قصيرة.'
                          )
                        }
                        className="ab-btn-secondary"
                      >
                        ملخص قرارات
                      </button>
                      <button
                        type="button"
                        disabled={streaming}
                        onClick={() =>
                          void sendPrompt(
                            'استخدم search_knowledge_base فقط: ابحث في معرفة الفريق عن أهم الملفات، ولخّص ما تجده مع ذكر المصادر.'
                          )
                        }
                        className="ab-btn-accent-soft"
                      >
                        اسأل ملفات الفريق
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                posts.map((post) => <RoomPostCard key={post.id} post={post} />)
              )}
            </div>
          </div>

          <footer
            className={cn(
              'relative z-0 sticky bottom-0 border-t border-ab-border bg-ab-surface/95 p-2.5 backdrop-blur',
              // Members sheet/pane owns the hit target for invite «نسخ»
              showMore && shared && 'pointer-events-none max-md:invisible'
            )}
            aria-hidden={showMore && shared ? true : undefined}
          >
            {mentionPreview && (
              <p className="mb-1.5 text-[11px] text-ab-accent">
                سيتم توجيه الرد إلى {mentionPreview.nameAr}
              </p>
            )}
            {!mentionPreview &&
              !isGuest &&
              agentsWorking &&
              collabMode === 'team' &&
              roomAgents.length > 1 && (
              <p className="mb-1.5 text-[11px] text-stone-500">
                اكتب <span dir="ltr">@</span> واسم الوكيل (مثل{' '}
                <span dir="ltr">@reports</span>) أو اختر من القائمة — حتى{' '}
                {Math.min(ASSISTANT_PARALLEL_DEFAULT, roomAgents.length)}{' '}
                وكيل/مهمة معاً. المقاعد مشتركة لكل الموظفين.
              </p>
            )}
            {!mentionPreview &&
              !isGuest &&
              agentsWorking &&
              usesSharedRoomRoster(activeScopeId) &&
              collabMode !== 'team' && (
              <p className="mb-1.5 text-[11px] text-stone-500">
                اكتب <span dir="ltr">@</span> واسم الوكيل لاختيار من يرد —
                حتى {ASSISTANT_PARALLEL_DEFAULT} وكيل/مهمة معاً في غرفة الفريق.
              </p>
            )}
            {!isGuest && !agentsWorking && (
              <p className="mb-1.5 text-[11px] text-stone-500">
                ملاحظة للفريق فقط — لتفعيل ردود الوكلاء اختر «الوكلاء يعملون معنا».
              </p>
            )}
            {mentionMenu.length > 0 && (
              <ul
                className="mb-1.5 max-h-40 overflow-y-auto rounded-lg border border-ab-border bg-white py-1 shadow-sm"
                role="listbox"
                aria-label="اقتراحات الإشارة"
              >
                {mentionMenu.map((item) => (
                  <li key={`${item.kind}-${item.insert}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-[11px] hover:bg-stone-50"
                      onClick={() => applyMentionInsert(item.insert)}
                    >
                      <span className="font-medium text-ab-ink">
                        @{item.insert}
                      </span>
                      <span className="text-stone-500">{item.labelAr}</span>
                    </button>
                  </li>
                ))}
              </ul>
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
            {!isGuest && !streaming && agentsWorking && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    void sendPrompt(
                      'استخدم search_knowledge_base فقط: ابحث في معرفة الفريق ولخّص أهم النتائج مع المصادر.'
                    )
                  }
                  className="rounded-md border border-ab-accent/30 bg-ab-accent/5 px-2 py-1 text-[10px] font-medium text-ab-accent hover:bg-ab-accent/10"
                >
                  اسأل ملفات الفريق
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void sendPrompt(
                      'اعرض مواعيد تقويم الغرفة القادمة باختصار.'
                    )
                  }
                  className="rounded-md border border-ab-border bg-white px-2 py-1 text-[10px] text-stone-600 hover:bg-stone-50"
                >
                  مواعيد قادمة
                </button>
              </div>
            )}
            {composerFiles.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5" dir="rtl">
                {composerFiles.map((f) => (
                  <span
                    key={f.fileId}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-ab-accent/30 bg-ab-accent/5 px-2 py-0.5 text-[10px] text-ab-ink"
                  >
                    <span className="truncate" title={f.name}>
                      📎 {f.name}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-stone-400 hover:text-ab-warn"
                      aria-label="إزالة المرفق"
                      onClick={() => detachComposerFile(f.fileId)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <span className="self-center text-[10px] text-stone-500">
                  اكتب طلب التعديل ثم أرسل — النتيجة زر تنزيل
                </span>
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
              <LocalUploadPanel
                scopeId={activeScopeId}
                compact
                onFileReady={attachComposerFile}
              />
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
                  const v = e.target.value
                  setInput(v)
                  refreshMentionMenu(v)
                  setTyping(true)
                  if (typingTimer.current) clearTimeout(typingTimer.current)
                  typingTimer.current = setTimeout(() => setTyping(false), 1200)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && mentionMenu.length) {
                    e.preventDefault()
                    setMentionMenu([])
                    return
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendPrompt()
                  }
                }}
                disabled={streaming || isGuest}
                placeholder={
                  isGuest
                    ? 'سجّل الدخول للإرسال…'
                    : !agentsWorking
                      ? 'ملاحظة أو رسالة للفريق (بلا رد وكلاء)…'
                      : composerFiles.length
                        ? 'اكتب ماذا تريد تعديله في الملف المرفق…'
                        : collabMode === 'team'
                          ? 'اكتب @ واسم الوكيل أو العضو… @all للجميع'
                          : shared
                            ? 'اكتب @ واسم الوكيل — أو اسحب ملفاً / 📎'
                            : 'اسحب ملفاً أو 📎 أو تكلم بالميكروفون…'
                }
                className="ab-input max-h-28 min-h-[2.5rem] min-w-0 flex-1 resize-none rounded-xl !py-2.5 disabled:opacity-50"
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
                  disabled={(!input.trim() && !composerFiles.length) || isGuest}
                  title={isGuest ? 'سجّل الدخول للإرسال' : undefined}
                  className="ab-btn-primary h-10 shrink-0 rounded-xl px-4 text-sm"
                >
                  إرسال
                </button>
              )}
            </form>
          </footer>
        </section>
      )}

      {sidePanelOpen && !isCanvasFullscreen && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="اسحب لتكبير الدردشة أو المعاينة"
          title="اسحب يميناً/يساراً لتكبير الدردشة أو المعاينة"
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
              setSplitRatio(Math.min(0.75, Math.max(0.22, canvasShare)))
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

      {sidePanelOpen && (
        <section
          className={cn(
            'min-w-0 overflow-hidden rounded-xl border border-ab-border bg-ab-surface shadow-sm max-md:!w-full max-md:!basis-full',
            isCanvasFullscreen || previewOpen
              ? 'flex flex-1 flex-col max-md:fixed max-md:inset-0 max-md:z-[70] max-md:rounded-none'
              : 'hidden md:flex md:flex-col md:shrink-0'
          )}
          style={
            isCanvasFullscreen
              ? undefined
              : {
                  width: `${Math.round(splitRatio * 100)}%`,
                  flexBasis: `${Math.round(splitRatio * 100)}%`,
                }
          }
          aria-label="معاينة الملف أو لوحة المخرجات"
          onFocusCapture={() => setPresenceSurface('canvas')}
        >
          {(previewOpen || hasArtifacts) && (
            <div className="flex shrink-0 gap-1 border-b border-ab-border px-2 py-1.5">
              {previewOpen && (
                <button
                  type="button"
                  onClick={() => setSideTab('file')}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px]',
                    sideTab === 'file' || !hasArtifacts
                      ? 'bg-emerald-50 font-semibold text-emerald-900'
                      : 'text-stone-500 hover:bg-stone-50'
                  )}
                >
                  معاينة الملف
                  {previewFile ? ` · ${previewFile.name.slice(0, 18)}` : ''}
                </button>
              )}
              {hasArtifacts && (
                <button
                  type="button"
                  onClick={() => {
                    setSideTab('canvas')
                    setShowCanvas(true)
                  }}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px]',
                    sideTab === 'canvas' || !previewOpen
                      ? 'bg-stone-100 font-semibold text-ab-ink'
                      : 'text-stone-500 hover:bg-stone-50'
                  )}
                >
                  اللوحة
                </button>
              )}
            </div>
          )}
          {previewOpen && (sideTab === 'file' || !hasArtifacts) ? (
            <FilePreviewPane
              className="min-h-0 flex-1"
              onClose={() => {
                if (!hasArtifacts) {
                  /* pane closes via store */
                } else {
                  setSideTab('canvas')
                }
              }}
            />
          ) : (
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
          )}
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
          تيليجرام غير جاهز للإرسال — من الإعدادات افتح «ربط هذه المساحة»
          (محادثة خاصة) أو اربط مجموعة اللجان.
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
