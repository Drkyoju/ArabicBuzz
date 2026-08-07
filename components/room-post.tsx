'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bot,
  BookmarkPlus,
  CheckCheck,
  Download,
  Eye,
  FileText,
  Gavel,
  Image as ImageIcon,
  Mic,
  Send,
  Sparkles,
  User,
} from 'lucide-react'
import { QualityFlagBanner } from '@/components/quality-flag-banner'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { useFilePreviewStore } from '@/lib/files/preview-store'
import {
  parseFileMarkersFromText,
  sendWorkspaceFileToTelegram,
  setBridgeDragData,
  type BridgeFilePayload,
} from '@/lib/files/workspace-bridge'
import type { RoomFileAttachment, RoomPost } from '@/lib/scopes/types'
import { cn } from '@/lib/utils'
import { looksLikeDecisionOrMinutes } from '@/lib/rooms/item-acks'
import { FileEditedBadge } from '@/components/file-edited-badge'

function attachmentKind(a: RoomFileAttachment): 'voice' | 'image' | 'file' {
  const mime = (a.mimeType || '').toLowerCase()
  const name = (a.name || '').toLowerCase()
  if (
    mime.startsWith('audio/') ||
    /\.(ogg|opus|webm|mp3|m4a|wav|aac)$/i.test(name)
  ) {
    return 'voice'
  }
  if (
    mime.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|tiff?)$/i.test(name)
  ) {
    return 'image'
  }
  return 'file'
}

function toBridge(a: RoomFileAttachment): BridgeFilePayload {
  const kind = attachmentKind(a)
  return {
    fileId: a.fileId,
    name: a.name,
    mimeType: a.mimeType,
    scopeId: a.scopeId,
    kind: kind === 'voice' ? 'voice' : a.edited ? 'edited' : 'file',
    edited: a.edited,
  }
}

async function shareAttachmentTelegram(a: RoomFileAttachment) {
  const sent = await sendWorkspaceFileToTelegram(
    toBridge(a),
    `من الغرفة: ${a.name}`
  )
  if (!sent.ok) throw new Error(sent.error || 'تعذّر الإرسال')
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

function RoomMediaChip({
  attachment,
  busyId,
  onBusy,
  onError,
}: {
  attachment: RoomFileAttachment
  busyId: string | null
  onBusy: (id: string | null) => void
  onError: (msg: string) => void
}) {
  const openPreview = useFilePreviewStore((s) => s.openPreview)
  const kind = attachmentKind(attachment)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)

  useEffect(() => {
    if (kind !== 'voice' && kind !== 'image') return
    let cancelled = false
    let objectUrl: string | null = null
    void (async () => {
      try {
        const path =
          attachment.downloadPath ||
          `/api/storage/file?id=${encodeURIComponent(attachment.fileId)}&scopeId=${encodeURIComponent(attachment.scopeId)}`
        const res = await fetch(path, { headers: await authHeaders() })
        if (!res.ok || cancelled) return
        const blob = await res.blob()
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) setMediaUrl(objectUrl)
      } catch {
        /* preview optional */
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [
    attachment.downloadPath,
    attachment.fileId,
    attachment.scopeId,
    kind,
  ])

  return (
    <div
      draggable
      onDragStart={(e) => {
        setBridgeDragData(e.dataTransfer, toBridge(attachment))
      }}
      title="اسحب إلى لوحة تيليجرام لإرساله للمجموعة"
      className="flex max-w-full flex-col gap-1.5 rounded-lg border border-ab-accent/25 bg-white px-2 py-1.5 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-1.5" dir="ltr">
        {kind === 'voice' ? (
          <Mic className="h-3.5 w-3.5 shrink-0 text-ab-accent" aria-hidden />
        ) : kind === 'image' ? (
          <ImageIcon
            className="h-3.5 w-3.5 shrink-0 text-ab-accent"
            aria-hidden
          />
        ) : (
          <FileText
            className="h-3.5 w-3.5 shrink-0 text-ab-accent"
            aria-hidden
          />
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ab-ink">
          {attachment.name}
        </span>
        <FileEditedBadge show={Boolean(attachment.edited)} />
      </div>

      {kind === 'image' && mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl}
          alt={attachment.name}
          className="max-h-40 w-auto max-w-full cursor-pointer rounded-md border border-ab-border object-contain"
          onClick={() =>
            openPreview({
              fileId: attachment.fileId,
              scopeId: attachment.scopeId,
              name: attachment.name,
              mimeType: attachment.mimeType || 'image/*',
            })
          }
        />
      ) : null}

      {kind === 'voice' && mediaUrl ? (
        <audio controls src={mediaUrl} className="w-full max-w-xs" dir="ltr">
          تشغيل الصوت غير متاح — استخدم التنزيل
        </audio>
      ) : null}

      <div className="flex flex-wrap items-center gap-1" dir="rtl">
        <button
          type="button"
          title="معاينة في الغرفة دون تنزيل"
          aria-label={`معاينة ${attachment.name}`}
          onClick={() =>
            openPreview({
              fileId: attachment.fileId,
              scopeId: attachment.scopeId,
              name: attachment.name,
              mimeType:
                attachment.mimeType ||
                (kind === 'voice'
                  ? 'audio/ogg'
                  : kind === 'image'
                    ? 'image/*'
                    : undefined),
            })
          }
          className="inline-flex items-center gap-1 rounded-md border border-ab-accent/30 bg-ab-accent/5 px-1.5 py-0.5 text-[10px] font-medium text-ab-accent hover:bg-ab-accent/10"
        >
          <Eye className="h-3 w-3" aria-hidden />
          معاينة
        </button>
        <button
          type="button"
          title="تنزيل الملف إلى جهازك"
          aria-label={`تنزيل ${attachment.name}`}
          disabled={busyId === attachment.fileId}
          onClick={() => {
            onError('')
            onBusy(attachment.fileId)
            void downloadAttachment(attachment)
              .catch((e) =>
                onError(e instanceof Error ? e.message : 'فشل التنزيل')
              )
              .finally(() => onBusy(null))
          }}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-600/30 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
        >
          <Download className="h-3 w-3" aria-hidden />
          {busyId === attachment.fileId ? '…' : 'تنزيل'}
        </button>
        <button
          type="button"
          disabled={busyId === `tg-${attachment.fileId}`}
          title="إرسال لتيليجرام"
          onClick={() => {
            onError('')
            onBusy(`tg-${attachment.fileId}`)
            void shareAttachmentTelegram(attachment)
              .catch((e) =>
                onError(e instanceof Error ? e.message : 'فشل الإرسال')
              )
              .finally(() => onBusy(null))
          }}
          className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-60"
        >
          <Send className="h-3 w-3" aria-hidden />
          تيليجرام
        </button>
      </div>
    </div>
  )
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
  const [memBusy, setMemBusy] = useState(false)
  const [skillNote, setSkillNote] = useState('')
  const [skillBusy, setSkillBusy] = useState(false)
  const [postKind, setPostKind] = useState(post.postKind || 'chat')
  const [acks, setAcks] = useState<Array<{ userAr: string; userId: string }>>(
    []
  )
  const [seenByMe, setSeenByMe] = useState(false)
  const [ackBusy, setAckBusy] = useState(false)

  const isDecisionOrMinutes =
    postKind === 'decision' ||
    postKind === 'minutes' ||
    looksLikeDecisionOrMinutes(post.content || '')

  useEffect(() => {
    setPostKind(post.postKind || 'chat')
  }, [post.postKind, post.id])

  useEffect(() => {
    if (!isDecisionOrMinutes || post.streaming) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/rooms/acks?itemKind=post&itemId=${encodeURIComponent(post.id)}`,
          { headers: await authHeaders() }
        )
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          acks?: Array<{ userAr: string; userId: string }>
          seenByMe?: boolean
        }
        setAcks(data.acks || [])
        setSeenByMe(Boolean(data.seenByMe))
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isDecisionOrMinutes, post.id, post.streaming])

  async function setKind(kind: 'chat' | 'decision' | 'minutes') {
    setAckBusy(true)
    try {
      const res = await fetch('/api/rooms/posts', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'set_kind',
          scopeId: post.scopeId,
          postId: post.id,
          postKind: kind,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setPostKind(kind)
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'فشل الوسم')
    } finally {
      setAckBusy(false)
    }
  }

  async function toggleSeen() {
    setAckBusy(true)
    try {
      const res = await fetch('/api/rooms/acks', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId: post.scopeId,
          itemKind: 'post',
          itemId: post.id,
          seen: !seenByMe,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        acks?: Array<{ userAr: string; userId: string }>
        seen?: boolean
      }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setAcks(data.acks || [])
      setSeenByMe(Boolean(data.seen))
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'فشل الاطّلاع')
    } finally {
      setAckBusy(false)
    }
  }

  const attachments = (() => {
    const fromPost = post.attachments || []
    const fromText = parseFileMarkersFromText(
      post.content || '',
      post.scopeId
    ).map(
      (p): RoomFileAttachment => ({
        fileId: p.fileId,
        name: p.name,
        mimeType: p.mimeType,
        scopeId: p.scopeId,
        edited: p.edited,
      })
    )
    const map = new Map<string, RoomFileAttachment>()
    for (const a of [...fromPost, ...fromText]) {
      if (a.fileId) map.set(a.fileId, { ...map.get(a.fileId), ...a })
    }
    return [...map.values()]
  })()

  return (
    <article
      id={`room-post-${post.id}`}
      className={cn(
        'mb-3 scroll-mt-24 px-1 py-1.5',
        isAgent
          ? 'border-e-2 border-ab-accent/40 pe-2.5'
          : isChannel
            ? 'rounded-md border border-dashed border-stone-300 bg-stone-50/80 px-2.5 py-2'
            : 'border-e-2 border-transparent pe-2.5'
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
            <span className="ab-room-post-author">
              {post.authorNameAr}
            </span>
            <span className="text-[10px] text-stone-500">
              {isAgent
                ? 'وكيل'
                : isChannel
                  ? 'قناة / نظام'
                  : 'بشري'}
            </span>
            {postKind === 'decision' && (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                <Gavel className="h-2.5 w-2.5" />
                قرار
              </span>
            )}
            {postKind === 'minutes' && (
              <span className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-900">
                <FileText className="h-2.5 w-2.5" />
                محضر
              </span>
            )}
            <PostTime createdAt={post.createdAt} />
          </div>
        </div>
        {post.streaming && (
          <span className="text-[10px] text-ab-accent">يكتب…</span>
        )}
      </header>

      <div className="ab-room-post-body">
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
          {post.authorKind === 'human' && !post.streaming && (
            <>
              <button
                type="button"
                disabled={ackBusy}
                onClick={() =>
                  void setKind(postKind === 'decision' ? 'chat' : 'decision')
                }
                className="inline-flex items-center gap-1 text-[10px] text-stone-400 hover:text-amber-800"
              >
                <Gavel className="h-3 w-3" />
                {postKind === 'decision' ? 'إلغاء وسم القرار' : 'وسم كقرار'}
              </button>
              <button
                type="button"
                disabled={ackBusy}
                onClick={() =>
                  void setKind(postKind === 'minutes' ? 'chat' : 'minutes')
                }
                className="inline-flex items-center gap-1 text-[10px] text-stone-400 hover:text-sky-800"
              >
                <FileText className="h-3 w-3" />
                {postKind === 'minutes' ? 'إلغاء وسم المحضر' : 'وسم كمحضر'}
              </button>
            </>
          )}
          {isDecisionOrMinutes && !post.streaming && (
            <button
              type="button"
              disabled={ackBusy}
              onClick={() => void toggleSeen()}
              className={cn(
                'inline-flex items-center gap-1 text-[10px]',
                seenByMe
                  ? 'font-semibold text-emerald-700'
                  : 'text-stone-400 hover:text-ab-accent'
              )}
            >
              <CheckCheck className="h-3 w-3" />
              {seenByMe ? 'اطّلعت ✓' : 'اطّلعت'}
              {acks.length > 0 ? ` · ${acks.length}` : ''}
            </button>
          )}
          {isDecisionOrMinutes && acks.length > 0 && (
            <p className="w-full text-[10px] text-stone-500">
              اطّلع:{' '}
              {acks
                .map((a) => a.userAr)
                .slice(0, 8)
                .join(' · ')}
              {acks.length > 8 ? ` و${acks.length - 8}` : ''}
            </p>
          )}
          <button
            type="button"
            disabled={memBusy}
            onClick={() => {
              void (async () => {
                const text = (post.content || '').trim().slice(0, 4000)
                if (!text) {
                  setMemNote('لا يوجد نص للحفظ.')
                  return
                }
                setMemBusy(true)
                setMemNote('جاري الرفع إلى عقل الشركة…')
                try {
                  const stamp = new Date()
                    .toISOString()
                    .slice(0, 19)
                    .replace(/[:T]/g, '-')
                  const file = new File([text], `note-room-${stamp}.txt`, {
                    type: 'text/plain;charset=utf-8',
                  })
                  const body = new FormData()
                  body.append('scopeId', post.scopeId)
                  body.append('file', file)
                  const up = await fetch('/api/storage/upload', {
                    method: 'POST',
                    headers: await authHeaders(),
                    body,
                  })
                  const upData = (await up.json()) as {
                    ok?: boolean
                    error?: string
                    messageAr?: string
                    file?: { id?: string }
                  }
                  const localFileId = upData.file?.id
                  if (!up.ok || !localFileId) {
                    throw new Error(
                      upData.error ||
                        upData.messageAr ||
                        'تعذّر حفظ الملف في الغرفة'
                    )
                  }
                  useWorkspaceStore.getState().addMemory(post.scopeId, text)
                  const brain = await fetch('/api/google/drive/brain/upload', {
                    method: 'POST',
                    headers: await authHeaders({
                      'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify({
                      scopeId: post.scopeId,
                      localFileId,
                    }),
                  })
                  const brainData = (await brain.json()) as {
                    ok?: boolean
                    needsGoogle?: boolean
                    error?: string
                    messageAr?: string
                  }
                  if (brainData.needsGoogle) {
                    setMemNote(
                      'حُفظ في الغرفة — اربط Google لرفعه إلى عقل الشركة (Drive)'
                    )
                  } else if (!brain.ok || brainData.ok === false) {
                    setMemNote(
                      brainData.messageAr ||
                        brainData.error ||
                        'حُفظ في الغرفة — تعذّرت مزامنة Drive'
                    )
                  } else {
                    setMemNote(
                      brainData.messageAr || 'حُفظ في عقل الشركة (Drive)'
                    )
                  }
                } catch (e) {
                  setMemNote(
                    e instanceof Error ? e.message : 'تعذّر الحفظ في Drive'
                  )
                } finally {
                  setMemBusy(false)
                  window.setTimeout(() => setMemNote(''), 4000)
                }
              })()
            }}
            className="inline-flex items-center gap-1 text-[10px] text-stone-400 hover:text-ab-accent disabled:opacity-50"
          >
            <BookmarkPlus className="h-3 w-3" />
            {memBusy ? 'جاري الحفظ…' : 'احفظ في عقل الشركة'}
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
                    const posts =
                      useWorkspaceStore.getState().postsByScope[
                        post.scopeId
                      ] || []
                    const idx = posts.findIndex((p) => p.id === post.id)
                    const windowPosts = posts.slice(
                      Math.max(0, idx - 4),
                      idx + 1
                    )
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
        <div className="mt-2 flex flex-wrap gap-2" dir="rtl">
          {attachments.map((a) => (
            <RoomMediaChip
              key={a.fileId}
              attachment={a}
              busyId={busyId}
              onBusy={setBusyId}
              onError={setDlError}
            />
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
          إجراء معلّق بانتظار موافقة بشرية — سيظهر تنبيه أعلى الصفحة عند الحاجة.
        </p>
      )}
      <QualityFlagBanner show={Boolean(post.qualityWarning)} />
    </article>
  )
}
