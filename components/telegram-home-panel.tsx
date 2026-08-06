'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, RefreshCw, Send } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { cn } from '@/lib/utils'
import type {
  TelegramFeedItem,
  TelegramLinkStatus,
} from '@/lib/rooms/telegram-feed'

const POLL_MS = 8_000

const SOURCE_TONE: Record<TelegramFeedItem['source'], string> = {
  site: 'bg-sky-50 text-sky-900 border-sky-200',
  telegram: 'bg-violet-50 text-violet-900 border-violet-200',
  bot: 'bg-emerald-50 text-emerald-900 border-emerald-200',
}

/**
 * نافذة تيليجرام على لوحة اليوم — إرسال من الموقع + مرآة لما يحدث في تيليجرام.
 */
export function TelegramHomePanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const signedIn = useSignedIn()
  const [items, setItems] = useState<TelegramFeedItem[]>([])
  const [link, setLink] = useState<TelegramLinkStatus | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const stickBottom = useRef(true)

  const load = useCallback(async () => {
    if (signedIn !== true) return
    setBusy(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(
        `/api/rooms/telegram-feed?scopeId=${encodeURIComponent(scopeId)}&limit=40`,
        { headers }
      )
      const json = (await res.json()) as {
        items?: TelegramFeedItem[]
        link?: TelegramLinkStatus
        linked?: boolean
        error?: string
        messageAr?: string
      }
      if (!res.ok) {
        if (res.status === 401) {
          setItems([])
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
    void load()
    if (signedIn !== true) return
    const t = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(t)
  }, [load, signedIn])

  useEffect(() => {
    if (!stickBottom.current || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [items])

  if (signedIn !== true) return null

  const linked = Boolean(link?.linked)
  const deepLink = link?.deepLink || ''

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

  return (
    <section
      className="rounded-xl border border-ab-border bg-white p-3.5"
      dir="rtl"
      aria-label="نافذة تيليجرام"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
          <MessageCircle className="h-4 w-4 text-ab-accent" aria-hidden />
          نافذة تيليجرام
          {linked ? (
            <span className="text-[11px] font-normal text-emerald-700">
              · مربوطة
            </span>
          ) : (
            <span className="text-[11px] font-normal text-amber-800">
              · غير مربوطة
            </span>
          )}
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-stone-50 px-2 py-1 text-[11px] text-stone-700 disabled:opacity-40"
        >
          <RefreshCw className={cn('h-3 w-3', busy && 'animate-spin')} />
          تحديث
        </button>
      </div>

      <p className="mb-2.5 text-[11px] leading-relaxed text-stone-500">
        اكتب هنا فيصل الرسالة إلى تيليجرام المربوط، وما يُرسل هناك يظهر هنا
        لأعضاء الغرفة — دون فتح التطبيق.
      </p>

      {!linked && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5">
          <p className="text-[12px] font-medium text-amber-950">
            {link?.hintAr ||
              'لا محادثة مربوطة لهذه المساحة. اربط البوت من تيليجرام أولاً.'}
          </p>
          {deepLink && link?.botConfigured !== false && (
            <a
              href={deepLink}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex rounded-md bg-ab-accent px-3 py-1.5 text-[11px] font-semibold text-white"
            >
              ربط هذه المساحة من تيليجرام
            </a>
          )}
        </div>
      )}

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          const dist =
            el.scrollHeight - el.scrollTop - el.clientHeight
          stickBottom.current = dist < 48
        }}
        className="mb-2.5 h-[min(22rem,50vh)] overflow-y-auto rounded-lg border border-ab-border/80 bg-stone-50/60 px-2.5 py-2"
      >
        {items.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-stone-400">
            {linked
              ? 'لا رسائل بعد — اكتب أدناه أو أرسل من تيليجرام.'
              : 'بعد الربط ستظهر هنا محادثة الموقع ⇄ تيليجرام.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((m) => (
              <li
                key={m.id}
                className="rounded-lg border border-ab-border/60 bg-white px-2.5 py-2"
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold',
                      SOURCE_TONE[m.source]
                    )}
                  >
                    {m.sourceLabelAr}
                  </span>
                  <span className="text-[11px] font-medium text-ab-ink">
                    {m.senderAr}
                  </span>
                  <span className="text-[10px] text-stone-400" dir="ltr">
                    {m.atAr}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ab-ink">
                  {m.textAr}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={2}
          disabled={!linked || sending}
          placeholder={
            linked
              ? 'اكتب رسالة للبوت / المحادثة المربوطة…'
              : 'اربط تيليجرام أولاً لإرسال الرسائل'
          }
          className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-ab-border bg-white px-3 py-2 text-sm text-ab-ink placeholder:text-stone-400 disabled:bg-stone-50 disabled:opacity-60"
        />
        <button
          type="button"
          disabled={!linked || sending || !text.trim()}
          onClick={() => void send()}
          className="inline-flex shrink-0 items-center gap-1 self-end rounded-lg bg-ab-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          إرسال
        </button>
      </div>

      {note && (
        <p className="mt-1.5 text-[11px] text-emerald-800">{note}</p>
      )}
      {err && <p className="mt-1.5 text-[11px] text-ab-danger">{err}</p>}
    </section>
  )
}
