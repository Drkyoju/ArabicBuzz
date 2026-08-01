'use client'

import { useEffect, useRef, useState } from 'react'
import { RoomPostCard } from '@/components/room-post'
import { CanvasViewer } from '@/components/canvas/artifact-viewer'
import { useCanvasStore } from '@/lib/canvas/store'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'
import {
  createBrowserSupabaseClient,
  getAccessToken,
  getBrowserSession,
  isSupabaseConfigured,
} from '@/lib/supabase/browser'
import { isSharedScope } from '@/lib/scopes/manager'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { LocalUploadPanel } from '@/components/local-upload-panel'
import { agentsForScope, resolveMentionHandoff } from '@/lib/rooms/agents'
import type { RoomPost } from '@/lib/scopes/types'
import { cn } from '@/lib/utils'

/**
 * Shared room workspace: persist + realtime + @mentions + outbound.
 */
export function RoomWorkspace({ className }: { className?: string }) {
  const { selectedModel } = useModelPickerStore()
  const {
    splitRatio,
    setSplitRatio,
    isCanvasFullscreen,
    toggleCanvasFullscreen,
    upsertArtifact,
  } = useCanvasStore()
  const dragging = useRef(false)
  const feedRef = useRef<HTMLDivElement>(null)

  const activeScopeId = useWorkspaceStore((s) => s.activeScopeId)
  const activeScope = useWorkspaceStore((s) => s.activeScope())
  const posts = useWorkspaceStore((s) => s.postsByScope[s.activeScopeId] || [])
  const appendPost = useWorkspaceStore((s) => s.appendPost)
  const updatePost = useWorkspaceStore((s) => s.updatePost)
  const setPostsForScope = useWorkspaceStore((s) => s.setPostsForScope)
  const mergePost = useWorkspaceStore((s) => s.mergePost)

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [displayName, setDisplayName] = useState('أنت')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteMsg, setInviteMsg] = useState('')
  const [outboundMsg, setOutboundMsg] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)

  const roomAgents = agentsForScope(activeScopeId)

  useEffect(() => {
    void getBrowserSession().then((session) => {
      const u = session?.user
      const name =
        u?.user_metadata?.full_name ||
        u?.user_metadata?.name ||
        u?.email?.split('@')[0] ||
        'أنت'
      setDisplayName(String(name))
    })
    try {
      if (!localStorage.getItem('ab-onboarded')) setShowOnboarding(true)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    feedRef.current?.scrollTo({
      top: feedRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [posts, streaming, activeScopeId])

  useEffect(() => {
    setInput('')
    setInviteMsg('')
    setOutboundMsg('')
  }, [activeScopeId])

  // Hydrate + realtime
  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch(
        `/api/rooms/posts?scopeId=${encodeURIComponent(activeScopeId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok || cancelled) return
      const data = (await res.json()) as { posts?: RoomPost[] }
      if (data.posts && data.posts.length > 0) {
        setPostsForScope(activeScopeId, data.posts)
      }

      const canvasRes = await fetch(
        `/api/rooms/canvas?scopeId=${encodeURIComponent(activeScopeId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (canvasRes.ok) {
        const c = (await canvasRes.json()) as {
          artifacts?: Array<{
            id: string
            type: string
            titleAr: string
            content: string
            language?: string
          }>
        }
        for (const a of c.artifacts || []) {
          upsertArtifact({
            id: a.id,
            type: (a.type as 'markdown') || 'markdown',
            titleAr: a.titleAr,
            content: a.content,
            language: a.language,
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

    const token = await getAccessToken()
    if (!token) {
      appendPost({
        id: `err-${Date.now()}`,
        scopeId: activeScopeId,
        authorKind: 'system',
        authorId: 'system',
        authorNameAr: 'النظام',
        content: 'يلزم تسجيل الدخول للمشاركة في الغرفة.',
        createdAt: Date.now(),
      })
      return
    }

    const handoff = resolveMentionHandoff(prompt)
    const agent = handoff.agent || roomAgents[0]
    const humanId = `h-${Date.now()}`
    const agentId = `a-${Date.now()}`

    await fetch('/api/rooms/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt,
          modelId: selectedModel,
          scopeId: activeScopeId,
          agentId: agent?.id,
          persist: false,
          authorNameAr: displayName,
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
                })
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
          'تعذّر بث الرد. تحقق من مفاتيح النماذج على Netlify.',
        streaming: false,
      })

      // Persist agent reply (chat onFinish also runs when persist!==false —
      // we used persist:false so save here)
      if (assembled) {
        await fetch('/api/rooms/posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
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

  async function sendInvite() {
    const token = await getAccessToken()
    if (!token || !inviteEmail.trim()) return
    const res = await fetch('/api/rooms/invites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        scopeId: activeScopeId,
        email: inviteEmail.trim(),
      }),
    })
    const data = (await res.json()) as { messageAr?: string; error?: string }
    setInviteMsg(data.messageAr || data.error || '')
    if (res.ok) setInviteEmail('')
  }

  async function sendOutbound(channel: 'telegram' | 'whatsapp') {
    const token = await getAccessToken()
    const text = input.trim() || outboundMsg
    if (!token || !text) {
      setOutboundMsg('اكتب نصاً في الحقل ثم أرسل للقناة.')
      return
    }
    const res = await fetch('/api/rooms/outbound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        scopeId: activeScopeId,
        textAr: text,
        channel,
      }),
    })
    const data = (await res.json()) as { noteAr?: string; error?: string }
    setOutboundMsg(data.noteAr || data.error || 'تم')
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
    <div dir="rtl" className={cn('flex h-screen w-full', className)}>
      {!isCanvasFullscreen && (
        <section
          className="relative flex h-full flex-col border-l border-ab-border bg-ab-bg"
          style={{ width: `${(1 - splitRatio) * 100}%` }}
          aria-label="غرفة العمل"
        >
          {showOnboarding && (
            <div className="border-b border-ab-accent/30 bg-ab-accent/10 px-4 py-3 text-sm">
              <p className="font-semibold text-ab-ink">مرحباً في Arabic Buzz</p>
              <ol className="mt-1 list-decimal space-y-1 pr-5 text-xs text-stone-600">
                <li>اختر مساحة شخصية أو غرفة مشتركة من اليمين.</li>
                <li>
                  اذكر وكيلاً بـ @slug مثل{' '}
                  <code dir="ltr">@reports</code> لتوجيه الرد.
                </li>
                <li>ادعُ زميلاً بالبريد من أسفل الغرفة المشتركة.</li>
              </ol>
              <button
                type="button"
                onClick={dismissOnboarding}
                className="mt-2 text-xs font-medium text-ab-accent"
              >
                حسناً، ابدأ
              </button>
            </div>
          )}

          <header className="border-b border-ab-border bg-ab-surface px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-stone-500">
                  {shared ? 'مساحة مشتركة' : 'مساحة شخصية'}
                </p>
                <h2 className="text-lg font-bold text-ab-ink">
                  {activeScope.nameAr}
                </h2>
                {activeScope.descriptionAr && (
                  <p className="mt-0.5 text-xs text-stone-500">
                    {activeScope.descriptionAr}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-stone-500">
                  وكلاء الغرفة:{' '}
                  {roomAgents.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="ml-1 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-ab-accent hover:bg-ab-accent/10"
                      onClick={() =>
                        setInput((v) =>
                          v.startsWith('@') ? v : `@${a.slug} ${v}`
                        )
                      }
                    >
                      @{a.slug}
                    </button>
                  ))}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleCanvasFullscreen}
                className="shrink-0 text-xs text-stone-500 hover:text-ab-ink"
              >
                توسيع اللوحة
              </button>
            </div>
          </header>

          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-4">
            {posts.length === 0 ? (
              <p className="text-sm text-stone-500">
                الغرفة فارغة — اكتب أول رسالة ليشارك الوكيل معك.
              </p>
            ) : (
              posts.map((post) => <RoomPostCard key={post.id} post={post} />)
            )}
          </div>

          <footer className="space-y-2 border-t border-ab-border bg-ab-surface p-3">
            <LocalUploadPanel scopeId={activeScopeId} />
            {shared && (
              <div className="flex flex-wrap gap-2">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="دعوة زميل: email@company.com"
                  className="min-w-[12rem] flex-1 rounded-md border border-ab-border px-2 py-1.5 text-xs"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => void sendInvite()}
                  className="rounded-md border border-ab-border px-2 py-1.5 text-xs"
                >
                  دعوة
                </button>
                <button
                  type="button"
                  onClick={() => void sendOutbound('telegram')}
                  className="rounded-md border border-ab-border px-2 py-1.5 text-xs"
                >
                  أرسل لتيليجرام
                </button>
                <button
                  type="button"
                  onClick={() => void sendOutbound('whatsapp')}
                  className="rounded-md border border-ab-border px-2 py-1.5 text-xs"
                >
                  أرسل لواتساب
                </button>
              </div>
            )}
            {(inviteMsg || outboundMsg) && (
              <p className="text-[11px] text-stone-500">
                {inviteMsg || outboundMsg}
              </p>
            )}
            {mentionPreview && (
              <p className="text-[11px] text-ab-accent">
                سيتم توجيه الرد إلى {mentionPreview.nameAr}
              </p>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void sendPrompt()
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={streaming}
                placeholder={
                  shared
                    ? 'اكتب للغرفة — جرّب @reports …'
                    : 'اكتب لمساحةك الشخصية…'
                }
                className="min-w-0 flex-1 rounded-md border border-ab-border bg-white px-3 py-2.5 text-sm outline-none ring-ab-accent focus:ring-2 disabled:opacity-50"
                aria-label="رسالة الغرفة"
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                className="rounded-md bg-ab-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                إرسال
              </button>
            </form>
          </footer>
        </section>
      )}

      <div
        role="separator"
        aria-orientation="vertical"
        className="hidden w-1 shrink-0 cursor-col-resize bg-ab-border hover:bg-ab-accent/40 md:block"
        onMouseDown={() => {
          dragging.current = true
          const onMove = (e: MouseEvent) => {
            if (!dragging.current) return
            const ratio = 1 - e.clientX / window.innerWidth
            setSplitRatio(Math.min(0.75, Math.max(0.25, ratio)))
          }
          const onUp = () => {
            dragging.current = false
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
      />

      <section
        className="hidden h-full overflow-hidden bg-ab-surface md:block"
        style={{
          width: isCanvasFullscreen ? '100%' : `${splitRatio * 100}%`,
        }}
        aria-label="لوحة المخرجات"
      >
        <CanvasViewer
          onPersist={async (artifact) => {
            const token = await getAccessToken()
            if (!token) return
            await fetch('/api/rooms/canvas', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                id: artifact.id,
                scopeId: activeScopeId,
                type: artifact.type,
                titleAr: artifact.titleAr,
                content: artifact.content,
                language: artifact.language,
              }),
            })
          }}
        />
      </section>
    </div>
  )
}
