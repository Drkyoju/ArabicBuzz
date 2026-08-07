'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  FileText,
  Mic,
  MessageCircle,
  RefreshCw,
  Send,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { cn } from '@/lib/utils'
import { fileFromDataTransfer } from '@/lib/files/pick-device-file'
import {
  getBridgeDragData,
  sendWorkspaceFileToTelegram,
  setBridgeDragData,
  uploadAndSendFileToTelegram,
  type BridgeFilePayload,
} from '@/lib/files/workspace-bridge'
import type {
  TelegramFeedItem,
  TelegramLinkStatus,
} from '@/lib/rooms/telegram-feed'

const POLL_MS = 8_000

const SOURCE_TONE: Record<TelegramFeedItem['source'], string> = {
  site: 'bg-sky-50 text-sky-900 border-sky-200',
  telegram: 'bg-stone-100 text-stone-800 border-stone-300',
  bot: 'bg-emerald-50 text-emerald-900 border-emerald-200',
}

export type TelegramMirrorChatProps = {
  /** fab = floating home dock chrome (caller wraps); embedded = side column */
  variant?: 'embedded' | 'panel'
  className?: string
  /** When false, skip polling (e.g. FAB closed). Default true. */
  active?: boolean
  /** Optional header trailing slot (close button for FAB). */
  headerExtra?: ReactNode
  onSendToAssistants?: (file: BridgeFilePayload) => void
  onSendToRoom?: (file: BridgeFilePayload) => void
  /** Called after a drop/send to Telegram succeeds. */
  onOutboundSent?: () => void
}

/**
 * Live Telegram mirror: messages + send + attachment chips + drop zone.
 * Used by home FAB dock and assistants side pane.
 */
export function TelegramMirrorChat({
  variant = 'embedded',
  className,
  active = true,
  headerExtra,
  onSendToAssistants,
  onSendToRoom,
  onOutboundSent,
}: TelegramMirrorChatProps) {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const signedIn = useSignedIn()
  const [items, setItems] = useState<TelegramFeedItem[]>([])
  const [link, setLink] = useState<TelegramLinkStatus | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [dropBusy, setDropBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const stickBottom = useRef(true)

  const load = useCallback(async () => {
    if (signedIn !== true) return
    setBusy(true)
    try {
      const attempt = async () => {
        const headers = await authHeaders()
        return fetch(
          `/api/rooms/telegram-feed?scopeId=${encodeURIComponent(scopeId)}&limit=40`,
          { headers }
        )
      }
      let res = await attempt()
      if (res.status === 401) {
        await new Promise((r) => setTimeout(r, 400))
        res = await attempt()
      }
      if (res.status === 401) {
        await new Promise((r) => setTimeout(r, 700))
        res = await attempt()
      }
      const json = (await res.json()) as {
        items?: TelegramFeedItem[]
        link?: TelegramLinkStatus
        error?: string
      }
      if (!res.ok) {
        if (res.status === 401) {
          setErr('')
          setLink((prev) =>
            prev ?? {
              linked: false,
              hasScopeBinding: false,
              hasOwnerFallback: false,
              botConfigured: true,
              deepLink: '',
              botUrl: '',
              hintAr:
                'تعذّر التحقق من الجلسة — حدّث الصفحة أو أعد تسجيل الدخول.',
            }
          )
          return
        }
        throw new Error(json.error || 'فشل تحميل نافذة تيليجرام')
      }
      setItems(json.items || [])
      setLink(json.link || null)
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطأ')
      setLink((prev) =>
        prev ?? {
          linked: false,
          hasScopeBinding: false,
          hasOwnerFallback: false,
          botConfigured: true,
          deepLink: '',
          botUrl: '',
          hintAr: 'تعذّر تحميل حالة تيليجرام — حاول التحديث.',
        }
      )
    } finally {
      setBusy(false)
    }
  }, [scopeId, signedIn])

  useEffect(() => {
    if (signedIn !== true || !active) return
    void load()
    const t = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(t)
  }, [load, signedIn, active])

  useEffect(() => {
    if (!active || !stickBottom.current || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [items, active])

  if (signedIn !== true) return null

  const statusKnown = link !== null
  const linked = Boolean(link?.linked)
  const botBase =
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL?.trim() ||
    'https://t.me/alhuda14bot'
  const deepLink =
    link?.deepLink ||
    `${botBase.replace(/\/$/, '')}?start=scope_${encodeURIComponent(scopeId)}`

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setErr('')
    setNote('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/rooms/telegram-feed', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopeId, textAr: body }),
      })
      const json = (await res.json()) as {
        ok?: boolean
        items?: TelegramFeedItem[]
        link?: TelegramLinkStatus
        error?: string
        noteAr?: string
      }
      if (json.link) setLink(json.link)
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'تعذّر الإرسال')
      }
      setText('')
      if (json.items) setItems(json.items)
      else await load()
      setNote(json.noteAr || 'تم الإرسال')
      stickBottom.current = true
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطأ')
    } finally {
      setSending(false)
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (!linked || dropBusy) return
    setDropBusy(true)
    setErr('')
    setNote('')
    try {
      const bridge = getBridgeDragData(e.dataTransfer)
      if (bridge) {
        const sent = await sendWorkspaceFileToTelegram({
          ...bridge,
          scopeId: bridge.scopeId || scopeId,
        })
        if (!sent.ok) throw new Error(sent.error || 'تعذّر الإرسال')
        setNote(`أُرسل «${bridge.name}» للمجموعة`)
        onOutboundSent?.()
        await load()
        return
      }
      const file = fileFromDataTransfer(e.dataTransfer)
      if (!file) {
        setNote('اسحب ملفاً من المهام أو من الجهاز')
        return
      }
      const sent = await uploadAndSendFileToTelegram({
        scopeId,
        file,
        captionAr: `ملف من Arabic Buzz: ${file.name}`,
      })
      if (!sent.ok) throw new Error(sent.error || 'تعذّر الإرسال')
      setNote(`أُرسل «${file.name}» للمجموعة`)
      onOutboundSent?.()
      await load()
    } catch (err) {
      setErr(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setDropBusy(false)
    }
  }

  return (
    <section
      className={cn(
        'flex flex-col overflow-hidden border border-ab-border bg-white',
        variant === 'embedded'
          ? 'h-full min-h-[22rem] rounded-xl shadow-sm'
          : 'rounded-xl shadow-ab',
        className
      )}
      dir="rtl"
      aria-label="نافذة تيليجرام"
      data-telegram-panel={variant === 'panel' ? '1' : 'embedded'}
      onDragOver={(e) => {
        e.preventDefault()
        if (!linked) return
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => void handleDrop(e)}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-ab-border bg-ab-stage/80 px-2.5 py-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] font-bold text-ab-ink">
          <MessageCircle
            className="h-3.5 w-3.5 shrink-0 text-ab-accent"
            aria-hidden
          />
          <span className="truncate">تيليجرام</span>
          {!statusKnown ? (
            <span className="shrink-0 text-[10px] font-normal text-ab-muted">
              · جاري التحقق…
            </span>
          ) : linked ? (
            <span className="shrink-0 text-[10px] font-normal text-emerald-700">
              · مربوطة
            </span>
          ) : (
            <span className="shrink-0 text-[10px] font-normal text-amber-800">
              · غير مربوطة
            </span>
          )}
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="ab-btn-ghost !h-8 !w-8 !px-0"
          title="تحديث"
          aria-label="تحديث"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
        </button>
        {headerExtra}
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-2.5 pt-2">
        {statusKnown && !linked && (
          <div className="mb-1.5 shrink-0 rounded-lg border border-amber-200 bg-amber-50/80 px-2 py-1.5">
            <p className="text-[10px] leading-snug text-amber-950">
              {link?.hintAr ||
                'افتح الرابط ثم اضغط Start في تيليجرام لربط هذه المساحة.'}
            </p>
            <ol className="mt-1 list-decimal space-y-0.5 pe-3 text-[10px] leading-snug text-amber-950/90">
              <li>
                خاص: «ربط من تيليجرام» ثم Start
                {botBase.includes('t.me/') ? (
                  <>
                    {' '}
                    (
                    <span dir="ltr">
                      @
                      {botBase
                        .replace(/^https?:\/\/t\.me\//i, '')
                        .replace(/\/$/, '')}
                    </span>
                    ).
                  </>
                ) : (
                  '.'
                )}
              </li>
              <li>
                مجموعة: أضف البوت ثم أرسل{' '}
                <code dir="ltr">/link@alhuda14bot scope_{scopeId}</code>
              </li>
            </ol>
            {deepLink && link?.botConfigured !== false && (
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex rounded-md bg-ab-accent px-2 py-1 text-[10px] font-semibold text-white"
              >
                ربط من تيليجرام
              </a>
            )}
          </div>
        )}
        {statusKnown && linked && link?.hintAr && !link.hasScopeBinding && (
          <div className="mb-1.5 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2 py-1.5">
            <p className="text-[10px] leading-snug text-emerald-950">
              {link.hintAr}
            </p>
            {deepLink && (
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex rounded-md border border-emerald-300 bg-white px-2 py-1 text-[10px] font-semibold text-emerald-900"
              >
                تأكيد ربط المساحة
              </a>
            )}
          </div>
        )}

        {linked && (
          <p
            className={cn(
              'mb-1.5 shrink-0 rounded-md border px-2 py-1 text-[10px] leading-snug',
              dragOver
                ? 'border-ab-accent bg-ab-accent/10 text-ab-accent'
                : 'border-dashed border-ab-border/80 bg-stone-50/80 text-stone-600'
            )}
          >
            {dropBusy
              ? 'جاري الإرسال للمجموعة…'
              : dragOver
                ? 'أفلت هنا لإرسال الملف لتيليجرام'
                : 'اسحب ملفاً معدَّلاً من المهام إلى هنا · أو اسحب صوتاً/ملفاً من الرسالة إلى المساعدين'}
          </p>
        )}

        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget
            const dist = el.scrollHeight - el.scrollTop - el.clientHeight
            stickBottom.current = dist < 48
          }}
          className="mb-1.5 min-h-0 flex-1 overflow-y-auto rounded-lg border border-ab-border/80 bg-stone-50/60 px-2 py-1.5"
        >
          {items.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-stone-400">
              {linked
                ? 'لا رسائل بعد — اكتب أدناه أو من تيليجرام.'
                : 'بعد الربط تظهر المحادثة هنا.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((m) => (
                <li
                  key={m.id}
                  className="rounded-md border border-ab-border/60 bg-white px-2 py-1.5"
                >
                  <div className="mb-0.5 flex flex-wrap items-center gap-1">
                    <span
                      className={cn(
                        'inline-flex rounded border px-1 py-px text-[9px] font-semibold',
                        SOURCE_TONE[m.source]
                      )}
                    >
                      {m.sourceLabelAr}
                    </span>
                    <span className="text-[10px] font-medium text-ab-ink">
                      {m.senderAr}
                    </span>
                    <span className="text-[9px] text-stone-400" dir="ltr">
                      {m.atAr}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-[11px] leading-snug text-ab-ink">
                    {m.textAr}
                  </p>
                  {m.attachments && m.attachments.length > 0 ? (
                    <ul className="mt-1.5 space-y-1">
                      {m.attachments.map((a) => (
                        <li
                          key={`${m.id}-${a.fileId}`}
                          draggable
                          onDragStart={(e) => {
                            setBridgeDragData(e.dataTransfer, a)
                          }}
                          className="flex flex-wrap items-center gap-1 rounded-md border border-ab-border/70 bg-stone-50 px-1.5 py-1"
                        >
                          {a.kind === 'voice' ? (
                            <Mic
                              className="h-3 w-3 shrink-0 text-ab-accent"
                              aria-hidden
                            />
                          ) : (
                            <FileText
                              className="h-3 w-3 shrink-0 text-ab-accent"
                              aria-hidden
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-ab-ink">
                            {a.name}
                          </span>
                          {onSendToAssistants ? (
                            <button
                              type="button"
                              className="rounded border border-ab-accent/30 bg-ab-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-ab-accent"
                              onClick={() => onSendToAssistants(a)}
                            >
                              للمساعدين
                            </button>
                          ) : null}
                          {onSendToRoom ? (
                            <button
                              type="button"
                              className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-stone-700"
                              onClick={() => onSendToRoom(a)}
                            >
                              لغرفة الفريق
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            rows={1}
            disabled={!linked || sending}
            placeholder={
              !statusKnown
                ? 'جاري التحقق…'
                : linked
                  ? 'اكتب رسالة…'
                  : 'اربط تيليجرام أولاً'
            }
            className="ab-input min-h-[2rem] flex-1 resize-none !rounded-md !px-2 !py-1.5 text-[12px] disabled:bg-stone-50 disabled:opacity-60"
          />
          <button
            type="button"
            disabled={!linked || sending || !text.trim()}
            onClick={() => void send()}
            className="ab-btn-primary shrink-0 self-end !px-2 !py-1.5 text-[11px]"
          >
            <Send className="h-3 w-3" aria-hidden />
            إرسال
          </button>
        </div>

        {note && (
          <p className="mt-1 shrink-0 text-[10px] text-emerald-800">{note}</p>
        )}
        {err && (
          <p className="mt-1 shrink-0 text-[10px] text-ab-danger">{err}</p>
        )}
      </div>
    </section>
  )
}
