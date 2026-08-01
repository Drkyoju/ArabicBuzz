'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PanelRightOpen, MessageSquare } from 'lucide-react'
import { RoomPostCard } from '@/components/room-post'
import { CanvasViewer } from '@/components/canvas/artifact-viewer'
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
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { LocalUploadPanel } from '@/components/local-upload-panel'
import { RoomPresenceBar } from '@/components/room-presence'
import { AgentSeatsPanel } from '@/components/agent-seats-panel'
import { RoomTeamPanel } from '@/components/room-team-panel'
import { SecurityPosturePicker } from '@/components/security-posture-picker'
import { ModelPicker } from '@/components/model-picker'
import { useSecurityPostureStore } from '@/lib/security/posture-store'
import { agentsForScope, resolveMentionHandoff } from '@/lib/rooms/agents'
import type { RoomCitation, RoomPost } from '@/lib/scopes/types'
import { cn } from '@/lib/utils'

const EMPTY_POSTS: RoomPost[] = []

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
  } = useCanvasStore()
  const feedRef = useRef<HTMLDivElement>(null)

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
  const [displayName, setDisplayName] = useState('أنت')
  const [outboundMsg, setOutboundMsg] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [typing, setTyping] = useState(false)
  const [showCanvas, setShowCanvas] = useState(true)
  const [showMore, setShowMore] = useState(true)
  const [micNote, setMicNote] = useState('')
  const prevArtifactCount = useRef(0)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const posture = useSecurityPostureStore((s) => s.posture)
  const hasArtifacts = artifacts.length > 0
  const canvasOpen = isCanvasFullscreen || (showCanvas && hasArtifacts)

  const roomAgents = agentsForScope(activeScopeId)

  // Auto-open canvas when a new artifact appears
  useEffect(() => {
    if (artifacts.length > prevArtifactCount.current) {
      setShowCanvas(true)
    }
    prevArtifactCount.current = artifacts.length
  }, [artifacts.length])

  // Keep activity strip open by default for shared rooms
  useEffect(() => {
    if (activeScope && isSharedScope(activeScope)) {
      setShowMore(true)
    }
  }, [activeScopeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void getBrowserSession().then((session) => {
      const u = session?.user
      let name =
        u?.user_metadata?.full_name ||
        u?.user_metadata?.name ||
        u?.email?.split('@')[0] ||
        'أنت'
      try {
        const saved = localStorage.getItem('ab-display-name')
        if (saved) name = saved
        const scope = localStorage.getItem('ab-active-scope')
        if (scope) setActiveScopeId(scope)
      } catch {
        /* ignore */
      }
      setDisplayName(String(name))
    })
    try {
      if (!localStorage.getItem('ab-onboarded')) setShowOnboarding(true)
    } catch {
      /* ignore */
    }
  }, [setActiveScopeId])

  useEffect(() => {
    feedRef.current?.scrollTo({
      top: feedRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [posts, streaming, activeScopeId])

  useEffect(() => {
    setInput('')
    setOutboundMsg('')
  }, [activeScopeId])

  // Hydrate + realtime
  useEffect(() => {
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
        setPostsForScope(activeScopeId, data.posts)
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
  ])

  if (!activeScope) {
    return (
      <div className="p-8 text-sm text-stone-500" dir="rtl">
        اختر مساحة من الشريط الجانبي.
      </div>
    )
  }

  const shared = isSharedScope(activeScope)
  const { agent: mentionPreview } = resolveMentionHandoff(input)
  const agentNameAr =
    mentionPreview?.nameAr || roomAgents[0]?.nameAr || 'وكيل الغرفة'

  async function sendPrompt() {
    const prompt = input.trim()
    if (!prompt || streaming) return
    setInput('')

    const headers = await authHeaders({
      'Content-Type': 'application/json',
    })

    const handoff = resolveMentionHandoff(prompt)
    const agent = handoff.agent || roomAgents[0]
    const humanId = `h-${Date.now()}`
    const agentId = `a-${Date.now()}`

    await fetch('/api/rooms/posts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: humanId,
        scopeId: activeScopeId,
        content: prompt,
        authorNameAr: displayName,
        mentionAgentId: agent?.id,
      }),
    })

    appendPost({
      id: humanId,
      scopeId: activeScopeId,
      authorKind: 'human',
      authorId: 'me',
      authorNameAr: displayName,
      content: prompt,
      createdAt: Date.now(),
    })
    appendPost({
      id: agentId,
      scopeId: activeScopeId,
      authorKind: 'agent',
      authorId: agent?.id || 'room-agent',
      authorNameAr: agent?.nameAr || agentNameAr,
      content: '',
      createdAt: Date.now() + 1,
      streaming: true,
    })
    setStreaming(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt,
          modelId: selectedModel,
          scopeId: activeScopeId,
          agentId: agent?.id,
          persist: false,
          authorNameAr: displayName,
          securityPosture: posture,
        }),
      })

      if (!res.ok || !res.body) {
        updatePost(activeScopeId, agentId, {
          content: `تعذّر الرد (HTTP ${res.status}).`,
          streaming: false,
        })
        setStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assembled = ''
      const citations: RoomCitation[] = []
      let pendingApprovalId: string | undefined
      while (true) {
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
                toolName?: string
                toolCallId?: string
              }
              if (
                event.type === 'text-delta' ||
                typeof event.delta === 'string' ||
                (event.type === 'text' && typeof event.text === 'string')
              ) {
                assembled += String(event.delta ?? event.text ?? '')
                updatePost(activeScopeId, agentId, {
                  content: assembled,
                  streaming: true,
                  citations: citations.length ? [...citations] : undefined,
                  pendingApprovalId,
                })
              }

              const toolOut = event.output ?? event.result
              if (toolOut && typeof toolOut === 'object') {
                const out = toolOut as Record<string, unknown>
                if (out.status === 'paused' && typeof out.approvalId === 'string') {
                  pendingApprovalId = out.approvalId
                  updatePost(activeScopeId, agentId, {
                    content: assembled,
                    streaming: true,
                    pendingApprovalId,
                  })
                }
                const docs = out.documents as
                  | Array<{ citation?: string; titleAr?: string; excerpt?: string }>
                  | undefined
                if (Array.isArray(docs)) {
                  for (const d of docs) {
                    const label =
                      d.citation ||
                      (d.titleAr ? `[مصدر: ${d.titleAr}]` : '') ||
                      ''
                    if (
                      label &&
                      !citations.some((c) => c.labelAr === label)
                    ) {
                      citations.push({
                        labelAr: label,
                        excerpt: d.excerpt,
                      })
                    }
                  }
                  updatePost(activeScopeId, agentId, {
                    content: assembled,
                    streaming: true,
                    citations: [...citations],
                    pendingApprovalId,
                  })
                }
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
      updatePost(activeScopeId, agentId, {
        content:
          assembled ||
          (pendingApprovalId
            ? 'الإجراء معلّق بانتظار موافقتك في قسم الموافقات.'
            : 'تعذّر بث الرد. تحقق من مفاتيح النماذج على Netlify.'),
        streaming: false,
        citations: citations.length ? citations : undefined,
        pendingApprovalId,
      })

      // Persist agent reply (chat onFinish also runs when persist!==false —
      // we used persist:false so save here)
      if (assembled) {
        await fetch('/api/rooms/posts', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            scopeId: activeScopeId,
            content: assembled,
            authorKind: 'agent',
            authorId: agent?.id || 'agent-desk',
            authorNameAr: agent?.nameAr || agentNameAr,
            mentionAgentId: agent?.id,
          }),
        })
      }
    } catch {
      updatePost(activeScopeId, agentId, {
        content: 'حدث خطأ في الاتصال.',
        streaming: false,
      })
    } finally {
      setStreaming(false)
    }
  }

  async function sendOutbound(channel: 'telegram' | 'whatsapp') {
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
        channel,
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
        'flex h-[calc(100dvh-2.75rem)] w-full gap-3 ab-stage p-3 md:h-dvh',
        className
      )}
    >
      {!isCanvasFullscreen && (
        <section
          className={cn(
            'relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-ab-border bg-ab-surface shadow-sm',
            canvasOpen ? 'w-full md:w-[min(42%,28rem)] md:shrink-0' : 'w-full flex-1'
          )}
          aria-label="غرفة العمل"
        >
          {showOnboarding && (
            <div className="border-b border-ab-accent/20 bg-ab-accent/5 px-4 py-2.5 text-sm">
              <p className="font-semibold text-ab-ink">مرحباً في Arabic Buzz</p>
              <ol className="mt-1 list-decimal space-y-0.5 pr-4 text-[11px] text-stone-600">
                <li>اختر مساحة من الشريط الجانبي.</li>
                <li>
                  اذكر وكيلاً بـ <code dir="ltr">@reports</code> أو انقر مقعده.
                </li>
                <li>اضغط الميكروفون وتحدث بالعربية — يتحول النص تلقائياً.</li>
              </ol>
              <button
                type="button"
                onClick={dismissOnboarding}
                className="mt-1.5 text-xs font-medium text-ab-accent"
              >
                حسناً، ابدأ
              </button>
            </div>
          )}

          <header className="flex flex-col gap-2 border-b border-ab-border px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-stone-400">
                  {shared
                    ? activeScopeId === 'shared-ops'
                      ? 'مساحة مشتركة · تشغيل وتنبيهات'
                      : 'مساحة مشتركة · قرارات الفريق'
                    : activeScopeId === 'personal-research'
                      ? 'مساحة شخصية · مسودات بحث'
                      : 'مساحة شخصية · مكتبك اليومي'}
                </p>
                <h2 className="truncate text-[15px] font-bold text-ab-ink">
                  {activeScope.nameAr}
                </h2>
                {activeScope.descriptionAr && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-stone-500">
                    {activeScope.descriptionAr}
                  </p>
                )}
                <div className="mt-1">
                  <RoomPresenceBar
                    scopeId={activeScopeId}
                    typing={typing}
                    displayName={displayName}
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {hasArtifacts && (
                  <button
                    type="button"
                    onClick={() => setShowCanvas((v) => !v)}
                    className="hidden rounded-md border border-ab-border px-2 py-1 text-[11px] text-stone-600 hover:bg-stone-50 md:inline-flex md:items-center md:gap-1"
                  >
                    <PanelRightOpen className="h-3 w-3" />
                    {canvasOpen ? 'إخفاء اللوحة' : 'اللوحة'}
                  </button>
                )}
                {shared && (
                  <button
                    type="button"
                    onClick={() => setShowMore((v) => !v)}
                    className="rounded-md border border-ab-border px-2 py-1 text-[11px] text-stone-600 hover:bg-stone-50"
                    aria-label="الحضور والسجل"
                  >
                    {showMore ? 'إخفاء السجل' : 'مين متصل · السجل'}
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-ab-border/60 pt-2">
              <ModelPicker compact />
              <SecurityPosturePicker compact />
            </div>
          </header>

          {showMore && shared && (
            <div className="max-h-[min(50vh,24rem)] space-y-3 overflow-y-auto border-b border-ab-border bg-stone-50 px-3 py-2">
              <RoomTeamPanel scopeId={activeScopeId} />
              <div className="rounded-md border border-dashed border-ab-border bg-white p-2">
                <p className="mb-1.5 text-[11px] font-semibold text-ab-ink">
                  تنبيه قناة (مو دعوة)
                </p>
                <p className="mb-2 text-[10px] text-stone-500">
                  يرسل نص الحقل الحالي إلى شات/رقم تجريبي مضبوط في Netlify
                  (TELEGRAM_TEST_CHAT_ID / WHATSAPP_TEST_TO) — لا يضيف أحداً
                  للغرفة.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void sendOutbound('telegram')}
                    className="rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs"
                  >
                    تيليجرام · تنبيه
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendOutbound('whatsapp')}
                    className="rounded-md border border-ab-border bg-white px-2 py-1.5 text-xs"
                  >
                    واتساب · تنبيه
                  </button>
                </div>
                {outboundMsg && (
                  <p className="mt-1.5 text-[10px] text-stone-500">
                    {outboundMsg}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="border-b border-ab-border px-3 py-2">
            <AgentSeatsPanel
              scopeId={activeScopeId}
              activeAgentId={mentionPreview?.id}
              onSeatClick={(a) =>
                setInput((v) => (v.startsWith('@') ? v : `@${a.slug} ${v}`))
              }
            />
          </div>

          <div ref={feedRef} className="flex-1 overflow-y-auto px-3 py-3">
            {posts.length === 0 ? (
              <div className="relative flex h-full min-h-[12rem] flex-col items-center justify-center overflow-hidden rounded-xl bg-gradient-to-bl from-stone-50 via-white to-emerald-50/50 px-4 py-10 text-center">
                <MessageSquare
                  className="mb-3 h-10 w-10 text-stone-300"
                  aria-hidden
                />
                <p className="text-base font-semibold text-ab-ink">
                  ابدأ المحادثة
                </p>
                <p className="mt-1 max-w-xs text-sm leading-relaxed text-stone-500">
                  اكتب سؤالك أو اضغط الميكروفون وتحدث بالعربية. يمكنك الإشارة
                  لوكيل بـ @slug أو رفع ملف من شريط الكتابة.
                </p>
              </div>
            ) : (
              posts.map((post) => <RoomPostCard key={post.id} post={post} />)
            )}
          </div>

          <footer className="sticky bottom-0 border-t border-ab-border bg-ab-surface/95 p-2.5 backdrop-blur">
            {mentionPreview && (
              <p className="mb-1.5 text-[11px] text-ab-accent">
                سيتم توجيه الرد إلى {mentionPreview.nameAr}
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
            <form
              className="flex items-end gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                void sendPrompt()
              }}
            >
              <LocalUploadPanel scopeId={activeScopeId} compact />
              <ComposerMicButton
                disabled={streaming}
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
                disabled={streaming}
                placeholder={
                  shared
                    ? 'اكتب أو تكلم بالميك… جرّب @reports'
                    : activeScopeId === 'personal-research'
                      ? 'اكتب أو تكلم بالميك… جرّب @research'
                      : 'اكتب أو تكلم بالميك… النص يظهر هنا للمراجعة'
                }
                className="max-h-28 min-h-[2.5rem] min-w-0 flex-1 resize-none rounded-xl border border-ab-border bg-white px-3 py-2.5 text-sm outline-none ring-ab-accent focus:ring-2 disabled:opacity-50"
                aria-label="رسالة الغرفة"
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                className="h-10 shrink-0 rounded-xl bg-ab-accent px-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                إرسال
              </button>
            </form>
          </footer>
        </section>
      )}

      {canvasOpen && (
        <section
          className={cn(
            'min-w-0 overflow-hidden rounded-xl border border-ab-border bg-ab-surface shadow-sm',
            isCanvasFullscreen
              ? 'flex flex-1 flex-col'
              : 'hidden flex-1 md:flex md:flex-col'
          )}
          aria-label="لوحة المخرجات"
        >
          <CanvasViewer
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
                }),
              })
              if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as {
                  error?: string
                }
                throw new Error(data.error || `فشل الحفظ (HTTP ${res.status})`)
              }
            }}
          />
        </section>
      )}
    </div>
  )
}
