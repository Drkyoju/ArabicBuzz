'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatMessage } from '@/components/chat-message'
import { ApprovalCard } from '@/components/approval-card'
import { SubagentProgressCard } from '@/components/subagent-progress-card'
import { CanvasWorkspace } from '@/components/canvas/canvas-workspace'
import { QualityFlagBanner } from '@/components/quality-flag-banner'
import type { ThreadItem } from '@/components/chat-thread-bar'
import { stripArtifactTags, createArtifactStreamParser } from '@/lib/agents/canvas-stream'
import { useCanvasStore } from '@/lib/canvas/store'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'
import { cn } from '@/lib/utils'

const LTR_CODE_CLASS =
  'font-mono bg-stone-900 text-stone-100 p-3 rounded-lg text-left my-2 text-sm overflow-x-auto'

export function LtrCodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div dir="ltr" className={LTR_CODE_CLASS}>
      {children}
    </div>
  )
}

type StreamMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  qualityWarning?: boolean
}

function StreamingAssistantBubble({
  content,
  qualityWarning,
}: {
  content: string
  qualityWarning?: boolean
}) {
  return (
    <div className="mb-4 border-r-2 border-ab-border pr-3" dir="rtl">
      <div className="mb-1 text-xs text-stone-500">الوكيل</div>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <LtrCodeBlock>{children}</LtrCodeBlock>,
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className)
            if (isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code
                dir="ltr"
                className="rounded bg-stone-200 px-1 py-0.5 font-mono text-left text-sm"
                {...props}
              >
                {children}
              </code>
            )
          },
        }}
      >
        {content || '…'}
      </ReactMarkdown>
      <QualityFlagBanner show={qualityWarning} />
    </div>
  )
}

/**
 * Main chat feed + artifact canvas (RTL). Technical/JSON/code blocks force LTR.
 */
export function ChatCanvas({
  items,
  className,
}: {
  items: ThreadItem[]
  className?: string
}) {
  const { selectedModel } = useModelPickerStore()
  const {
    upsertArtifact,
    splitRatio,
    setSplitRatio,
    isCanvasFullscreen,
    toggleCanvasFullscreen,
  } = useCanvasStore()
  const dragging = useRef(false)
  const feedRef = useRef<HTMLDivElement>(null)

  const [input, setInput] = useState('')
  const [extraMessages, setExtraMessages] = useState<StreamMessage[]>([])
  const [streaming, setStreaming] = useState(false)

  const staticMessages = useMemo(
    () => items.filter((i) => i.kind === 'message'),
    [items]
  )
  const approvals = useMemo(
    () => items.filter((i) => i.kind === 'approval'),
    [items]
  )
  const subagents = useMemo(
    () => items.filter((i) => i.kind === 'subagent'),
    [items]
  )

  useEffect(() => {
    feedRef.current?.scrollTo({
      top: feedRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [extraMessages, items, streaming])

  async function sendPrompt() {
    const prompt = input.trim()
    if (!prompt || streaming) return
    setInput('')
    const userId = `u-${Date.now()}`
    const asstId = `a-${Date.now()}`
    setExtraMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content: prompt },
      { id: asstId, role: 'assistant', content: '', streaming: true },
    ])
    setStreaming(true)

    // Netlify-optimized multi-model stream (`/api/chat`)
    try {
      const { authHeaders } = await import('@/lib/supabase/browser')
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          prompt,
          modelId: selectedModel,
        }),
      })

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        setExtraMessages((prev) =>
          prev.map((m) =>
            m.id === asstId
              ? {
                  ...m,
                  content:
                    errBody.error || `تعذّر الرد (HTTP ${res.status}).`,
                  streaming: false,
                }
              : m
          )
        )
        setStreaming(false)
        return
      }

      if (res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let assembled = ''
        const artifactParser = createArtifactStreamParser({
          onChatText: (visible) => {
            if (!visible) return
            assembled += visible
            setExtraMessages((prev) =>
              prev.map((m) =>
                m.id === asstId
                  ? { ...m, content: assembled, streaming: true }
                  : m
              )
            )
          },
          onArtifactUpsert: (partial) => {
            upsertArtifact({ ...partial, pendingReview: true })
          },
        })

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
                  artifactParser.push(String(event.delta ?? event.text ?? ''))
                }
              } catch {
                // ignore non-JSON SSE keepalives
              }
            }
          }
        }

        artifactParser.flush()

        if (!assembled) {
          assembled =
            'تعذّر بث الرد. تحقق من مفاتيح النماذج في قسم «مفاتيح API».'
        }

        setExtraMessages((prev) =>
          prev.map((m) =>
            m.id === asstId
              ? { ...m, content: assembled, streaming: false }
              : m
          )
        )
      } else {
        setExtraMessages((prev) =>
          prev.map((m) =>
            m.id === asstId
              ? {
                  ...m,
                  content: 'تعذّر بث الرد (لا يوجد جسم استجابة).',
                  streaming: false,
                }
              : m
          )
        )
      }
    } catch {
      setExtraMessages((prev) =>
        prev.map((m) =>
          m.id === asstId
            ? {
                ...m,
                content: 'حدث خطأ في الاتصال ببوابة النماذج.',
                streaming: false,
              }
            : m
        )
      )
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div
      dir="rtl"
      className={cn('flex h-[calc(100vh-0px)] w-full', className)}
    >
      {!isCanvasFullscreen && (
        <section
          className="relative flex h-full flex-col border-l border-ab-border bg-ab-surface"
          style={{ width: `${(1 - splitRatio) * 100}%` }}
          aria-label="بث المحادثة"
        >
          <header className="flex items-center justify-between border-b border-ab-border px-4 py-3">
            <h2 className="font-semibold text-ab-ink">خيط المحادثة</h2>
            <button
              type="button"
              onClick={toggleCanvasFullscreen}
              className="text-sm text-stone-500"
            >
              توسيع اللوحة
            </button>
          </header>

          <div ref={feedRef} className="flex-1 overflow-y-auto p-4" dir="rtl">
            {staticMessages.map((item) =>
              item.kind === 'message' ? (
                <ChatMessage
                  key={item.id}
                  role={item.role}
                  content={stripArtifactTags(item.content)}
                  qualityWarning={item.qualityWarning}
                />
              ) : null
            )}

            {approvals.map((item) =>
              item.kind === 'approval' ? (
                <ApprovalCard
                  key={item.id}
                  approvalId={item.approvalId}
                  actionName={item.actionName}
                  params={item.params}
                  riskLevel={item.riskLevel}
                  status={item.status}
                />
              ) : null
            )}

            {subagents.map((item) =>
              item.kind === 'subagent' ? (
                <SubagentProgressCard
                  key={item.id}
                  roleNameAr={item.roleNameAr}
                  status={item.status}
                />
              ) : null
            )}

            {extraMessages.map((m) =>
              m.role === 'assistant' ? (
                <StreamingAssistantBubble
                  key={m.id}
                  content={m.content}
                  qualityWarning={m.qualityWarning}
                />
              ) : (
                <ChatMessage key={m.id} role="user" content={m.content} />
              )
            )}
          </div>

          <form
            className="border-t border-ab-border p-3"
            onSubmit={(e) => {
              e.preventDefault()
              void sendPrompt()
            }}
          >
            <div className="flex gap-2">
              <input
                dir="rtl"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="اكتب رسالتك بالعربية…"
                className="min-w-0 flex-1 rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
                disabled={streaming}
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                className="rounded-md bg-ab-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                إرسال
              </button>
            </div>
          </form>
        </section>
      )}

      <div
        className="h-full w-1 shrink-0 cursor-col-resize bg-ab-border"
        onMouseDown={() => {
          dragging.current = true
          const onMove = (e: MouseEvent) => {
            if (!dragging.current) return
            // Account for fixed right sidebar (~17.5rem)
            const sidebar = 280
            const usable = Math.max(320, window.innerWidth - sidebar)
            const xFromRight = window.innerWidth - e.clientX - sidebar
            const ratio = Math.min(0.85, Math.max(0.35, xFromRight / usable))
            setSplitRatio(ratio)
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
        className="h-full bg-ab-bg"
        style={{
          width: isCanvasFullscreen ? '100%' : `${splitRatio * 100}%`,
        }}
        aria-label="لوحة العرض"
      >
        <div className="flex items-center justify-end gap-2 border-b border-ab-border px-3 py-2">
          <button
            type="button"
            onClick={toggleCanvasFullscreen}
            className="text-sm text-ab-accent"
          >
            {isCanvasFullscreen ? 'استعادة التقسيم' : 'ملء الشاشة'}
          </button>
        </div>
        <div className="h-[calc(100%-2.75rem)]">
          <CanvasWorkspace />
        </div>
      </section>
    </div>
  )
}
