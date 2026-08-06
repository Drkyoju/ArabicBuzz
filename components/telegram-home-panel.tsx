'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, RefreshCw, Send, X } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { cn } from '@/lib/utils'
import type {
  TelegramFeedItem,
  TelegramLinkStatus,
} from '@/lib/rooms/telegram-feed'

const POLL_MS = 8_000
/** localStorage: only '1' means open. Missing / '0' / anything else → closed. */
const STORAGE_KEY = 'arabicbuzz-telegram-panel-open'

const SOURCE_TONE: Record<TelegramFeedItem['source'], string> = {
  site: 'bg-sky-50 text-sky-900 border-sky-200',
  telegram: 'bg-violet-50 text-violet-900 border-violet-200',
  bot: 'bg-emerald-50 text-emerald-900 border-emerald-200',
}

function readStoredOpen(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * نافذة تيليجرام على لوحة اليوم — فقاعة قابلة للطي أسفل اليسار (يسار فيزيائي).
 * الافتراضي مغلق؛ عند الفتح لوحة مدمجة مع زر إغلاق واضح.
 */
export function TelegramHomePanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const signedIn = useSignedIn()
  const [open, setOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [items, setItems] = useState<TelegramFeedItem[]>([])
  const [link, setLink] = useState<TelegramLinkStatus | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const stickBottom = useRef(true)

  useEffect(() => {
    setOpen(readStoredOpen())
    setHydrated(true)
  }, [])

  const setOpenPersist = useCallback((next: boolean) => {
    setOpen(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }, [])

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
      // First paint often races Supabase session hydration → 401 without Bearer.
      let res = await attempt()
      if (res.status === 401) {
        await new Promise((r) => setTimeout(r, 400))
        res = await attempt()
      }
      const json = (await res.json()) as {
        items?: TelegramFeedItem[]
        link?: TelegramLinkStatus
        linked?: boolean
        error?: string
        messageAr?: string
      }
      if (!res.ok) {
        if (res.status === 401) {
          // Keep prior link if we had one; otherwise stay in "checking" (link null).
          setErr('')
          return
        }
        throw new Error(json.error || 'فشل تحميل نافذة تيليجرام')
      }
      setItems(json.items || [])
      setLink(json.link || null)
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطأ')
    } finally {
      setBusy(false)
    }
  }, [scopeId, signedIn])

  useEffect(() => {
    if (signedIn !== true || !open) return
    void load()
    const t = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(t)
  }, [load, signedIn, open])

  useEffect(() => {
    if (!open || !stickBottom.current || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [items, open])

  if (signedIn !== true || !hydrated) return null

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

  /* Physical left (not logical start) so RTL sidebar stays clear. */
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpenPersist(true)}
        className="pointer-events-auto fixed bottom-3 left-3 z-[70] inline-flex items-center gap-1.5 rounded-full border border-ab-border bg-white px-3.5 py-2.5 text-[12px] font-semibold text-ab-ink shadow-lg transition hover:bg-stone-50 md:bottom-4 md:left-4"
        aria-label="فتح تيليجرام"
        aria-expanded={false}
        data-telegram-fab="1"
      >
        <MessageCircle className="h-4 w-4 text-ab-accent" aria-hidden />
        تيليجرام
      </button>
    )
  }

  return (
    <section
      className="pointer-events-auto fixed bottom-3 left-3 z-[70] flex h-[min(18rem,58vh)] w-[min(18.5rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-ab-border bg-white shadow-xl md:bottom-4 md:left-4"
      dir="rtl"
      aria-label="نافذة تيليجرام"
      aria-expanded={true}
      data-telegram-panel="1"
    >
      {/* Header: always-visible close */}
      <div className="flex shrink-0 items-center gap-2 border-b border-ab-border bg-stone-50/90 px-2.5 py-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] font-bold text-ab-ink">
          <MessageCircle
            className="h-3.5 w-3.5 shrink-0 text-ab-accent"
            aria-hidden
          />
          <span className="truncate">تيليجرام</span>
          {!statusKnown ? (
            <span className="shrink-0 text-[10px] font-normal text-stone-500">
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
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ab-border bg-white text-stone-600 hover:bg-stone-100 disabled:opacity-40"
          title="تحديث"
          aria-label="تحديث"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
        </button>
        <button
          type="button"
          onClick={() => setOpenPersist(false)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 text-[12px] font-bold text-ab-ink shadow-sm transition hover:border-ab-danger hover:bg-red-50 hover:text-ab-danger"
          aria-label="إغلاق نافذة تيليجرام"
          title="إغلاق"
          data-telegram-close="1"
        >
          <X className="h-4 w-4" aria-hidden strokeWidth={2.5} />
          إغلاق
        </button>
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
                      @{botBase.replace(/^https?:\/\/t\.me\//i, '').replace(/\/$/, '')}
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
              <li>اسأل بـ <code dir="ltr">/ask@alhuda14bot …</code> — ثم ارجع هنا.</li>
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
            className="min-h-[2rem] flex-1 resize-none rounded-md border border-ab-border bg-white px-2 py-1.5 text-[12px] text-ab-ink placeholder:text-stone-400 disabled:bg-stone-50 disabled:opacity-60"
          />
          <button
            type="button"
            disabled={!linked || sending || !text.trim()}
            onClick={() => void send()}
            className="inline-flex shrink-0 items-center gap-1 self-end rounded-md bg-ab-accent px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
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
