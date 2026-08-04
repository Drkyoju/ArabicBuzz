'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, BookmarkPlus, Download, Sparkles, User } from 'lucide-react'
import { QualityFlagBanner } from '@/components/quality-flag-banner'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import type { RoomFileAttachment, RoomPost } from '@/lib/scopes/types'
import { cn } from '@/lib/utils'

function parseFileMarkers(content: string, scopeId: string): RoomFileAttachment[] {
  const out: RoomFileAttachment[] = []
  const re = /📎\s*ملف جاهز للتنزيل:\s*(.+?)\s*\(id:([^\)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    out.push({
      name: m[1].trim(),
      fileId: m[2].trim(),
      scopeId,
    })
  }
  return out
}

async function downloadAttachment(a: RoomFileAttachment) {
  const path =
    a.downloadPath ||
    `/api/storage/file?id=${encodeURIComponent(a.fileId)}&scopeId=${encodeURIComponent(a.scopeId)}`
  const res = await fetch(path, { headers: await authHeaders() })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || `تعذّر التنزيل (${res.status})`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a')
  el.href = url
  el.download = a.name || 'file'
  el.rel = 'noopener'
  document.body.appendChild(el)
  el.click()
  el.remove()
  URL.revokeObjectURL(url)
}

function LtrData({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="ltr"
      className="my-2 overflow-x-auto rounded-lg bg-stone-900 p-3 text-left font-mono text-sm text-stone-100"
    >
      {children}
    </div>
  )
}

function formatTime(ts: number) {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Riyadh',
    }).format(new Date(ts))
  } catch {
    return ''
  }
}

/** Render timestamps after mount; server and client clocks/locales differ. */
function PostTime({ createdAt }: { createdAt: number }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    setLabel(formatTime(createdAt))
  }, [createdAt])

  return (
    <span className="text-[11px] text-stone-400" suppressHydrationWarning>
      {label}
    </span>
  )
}

/** Single peer post in a humans+agents room timeline. */
export function RoomPostCard({ post }: { post: RoomPost }) {
  const isAgent = post.authorKind === 'agent'
  const isChannel =
    post.authorKind === 'channel' || post.authorKind === 'system'
  const [dlError, setDlError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [memNote, setMemNote] = useState('')
  const [skillNote, setSkillNote] = useState('')
  const [skillBusy, setSkillBusy] = useState(false)

  const attachments = (() => {
    const fromPost = post.attachments || []
    const fromText = parseFileMarkers(post.content || '', post.scopeId)
    const map = new Map<string, RoomFileAttachment>()
    for (const a of [...fromPost, ...fromText]) {
      if (a.fileId) map.set(a.fileId, a)
    }
    return [...map.values()]
  })()

  return (
    <article
      className={cn(
        'mb-3 px-1 py-1.5',
        isAgent
          ? 'border-r-2 border-ab-accent/40 pr-2.5'
          : isChannel
            ? 'rounded-md border border-dashed border-stone-300 bg-stone-50/80 px-2.5 py-2'
            : 'border-r-2 border-transparent pr-2.5'
      )}
      dir="rtl"
    >
      <header className="mb-1.5 flex items-center gap-2">
        <span
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full',
            isAgent
              ? 'bg-ab-accent/15 text-ab-accent'
              : isChannel
                ? 'bg-stone-200 text-stone-600'
                : 'bg-stone-200 text-ab-ink'
          )}
          aria-hidden
        >
          {isAgent || isChannel ? (
            <Bot className="h-3 w-3" />
          ) : (
            <User className="h-3 w-3" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-[13px] font-semibold text-ab-ink">
              {post.authorNameAr}
            </span>
            <span className="text-[10px] text-stone-500">
              {isAgent
                ? 'وكيل'
                : isChannel
                  ? 'قناة / نظام'
                  : 'بشري'}
            </span>
            <PostTime createdAt={post.createdAt} />
          </div>
        </div>
        {post.streaming && (
          <span className="text-[10px] text-ab-accent">يكتب…</span>
        )}
      </header>

      <div className="text-[13px] leading-relaxed text-ab-ink">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            pre: ({ children }) => <LtrData>{children}</LtrData>,
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
                  className="rounded bg-stone-200 px-1 py-0.5 text-left font-mono text-sm"
                  {...props}
                >
                  {children}
                </code>
              )
            },
          }}
        >
          {post.content || (post.streaming ? '…' : '')}
        </ReactMarkdown>
      </div>
      {post.citations && post.citations.length > 0 && (
        <div className="mt-2 space-y-1" dir="rtl">
          <p className="text-[10px] font-semibold text-stone-500">المصادر</p>
          <div className="flex flex-wrap gap-1.5">
          {post.citations.map((c, i) =>
            c.url ? (
              <a
                key={`${c.labelAr}-${i}`}
                href={c.url}
                target="_blank"
                rel="noreferrer"
                title={c.excerpt || undefined}
                className="inline-flex max-w-full items-center rounded-md border border-ab-accent/25 bg-ab-accent/5 px-2 py-0.5 text-[10px] font-medium text-ab-accent underline-offset-2 hover:underline"
              >
                <span className="truncate">{c.labelAr}</span>
              </a>
            ) : (
              <span
                key={`${c.labelAr}-${i}`}
                title={c.excerpt || undefined}
                className="inline-flex max-w-full items-center rounded-md border border-ab-accent/25 bg-ab-accent/5 px-2 py-0.5 text-[10px] font-medium text-ab-accent"
              >
                <span className="truncate">{c.labelAr}</span>
              </span>
            )
          )}
          </div>
        </div>
      )}
      {post.authorKind === 'human' || post.authorKind === 'agent' ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const text = (post.content || '').trim().slice(0, 800)
              if (!text) {
                setMemNote('لا يوجد نص للحفظ.')
                return
              }
              const ok = useWorkspaceStore
                .getState()
                .addMemory(post.scopeId, text)
              setMemNote(ok ? 'حُفظ في ذاكرة المساحة.' : 'موجود مسبقاً في الذاكرة.')
              window.setTimeout(() => setMemNote(''), 2500)
            }}
            className="inline-flex items-center gap-1 text-[10px] text-stone-400 hover:text-ab-accent"
          >
            <BookmarkPlus className="h-3 w-3" />
            احفظ في الذاكرة
          </button>
          {post.authorKind === 'agent' && (
            <button
              type="button"
              disabled={skillBusy}
              onClick={() => {
                void (async () => {
                  setSkillBusy(true)
                  setSkillNote('')
                  try {
                    const posts = useWorkspaceStore
                      .getState()
                      .postsByScope[post.scopeId] || []
                    const idx = posts.findIndex((p) => p.id === post.id)
                    const windowPosts = posts.slice(Math.max(0, idx - 4), idx + 1)
                    const threadMessages = windowPosts
                      .filter(
                        (p) =>
                          p.authorKind === 'human' || p.authorKind === 'agent'
                      )
                      .map((p) => ({
                        role:
                          p.authorKind === 'human'
                            ? ('user' as const)
                            : ('assistant' as const),
                        content: (p.content || '').slice(0, 1200),
                      }))
                    const res = await fetch('/api/skills/propose', {
                      method: 'POST',
                      headers: await authHeaders({
                        'Content-Type': 'application/json',
                      }),
                      body: JSON.stringify({
                        threadMessages,
                        scope: post.scopeId.startsWith('personal')
                          ? 'personal'
                          : 'shared',
                      }),
                    })
                    const data = (await res.json()) as {
                      error?: string
                      messageAr?: string
                    }
                    if (!res.ok) throw new Error(data.error || 'فشل الاقتراح')
                    setSkillNote(
                      data.messageAr || 'أُرسل الاقتراح — راجعه في المهارات.'
                    )
                  } catch (e) {
                    setSkillNote(
                      e instanceof Error ? e.message : 'فشل اقتراح المهارة'
                    )
                  } finally {
                    setSkillBusy(false)
                    window.setTimeout(() => setSkillNote(''), 4000)
                  }
                })()
              }}
              className="inline-flex items-center gap-1 text-[10px] text-stone-400 hover:text-ab-accent disabled:opacity-40"
            >
              <Sparkles className="h-3 w-3" />
              {skillBusy ? 'جاري الاقتراح…' : 'اقتراح مهارة'}
            </button>
          )}
          {(memNote || skillNote) && (
            <p className="w-full text-[10px] text-emerald-700">
              {skillNote || memNote}
            </p>
          )}
        </div>
      ) : null}
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" dir="rtl">
          {attachments.map((a) => (
            <button
              key={a.fileId}
              type="button"
              dir="ltr"
              disabled={busyId === a.fileId}
              onClick={() => {
                setDlError('')
                setBusyId(a.fileId)
                void downloadAttachment(a)
                  .catch((e) =>
                    setDlError(e instanceof Error ? e.message : 'فشل التنزيل')
                  )
                  .finally(() => setBusyId(null))
              }}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-emerald-600/30 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
            >
              <Download className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">
                {busyId === a.fileId ? 'جاري التنزيل…' : a.name}
              </span>
            </button>
          ))}
        </div>
      )}
      {dlError && (
        <p className="mt-1 text-[11px] text-red-600" dir="rtl">
          {dlError}
        </p>
      )}
      {post.pendingApprovalId && (
        <p className="mt-2 rounded-md border border-ab-warn/30 bg-ab-warn/10 px-2 py-1.5 text-[11px] text-ab-warn">
          إجراء معلّق بانتظار موافقة بشرية — راجع قسم «الموافقات».
        </p>
      )}
      <QualityFlagBanner show={Boolean(post.qualityWarning)} />
    </article>
  )
}
