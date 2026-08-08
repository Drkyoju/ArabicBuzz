'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  FileSearch,
  Inbox,
  Link2,
  Mail,
  Paperclip,
  PenSquare,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import {
  authHeaders,
  connectGoogleGmail,
} from '@/lib/supabase/browser'
import { PERSONAL_DESK_COPY } from '@/lib/scopes/personal-desk'
import { MailRichComposer } from '@/components/mail-rich-composer'
import { plainTextToMailHtml } from '@/lib/email/mail-html'

type Msg = {
  id: string
  threadId?: string
  subject: string
  from: string
  to: string
  date?: string
  snippet: string
  unread?: boolean
  starred?: boolean
  hasAttachment?: boolean
  labelIds?: string[]
}

type AttachmentMeta = {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
}

type MsgDetail = Msg & {
  bodyText: string
  bodyHtml?: string
  cc?: string
  attachments: AttachmentMeta[]
}

type Intel = {
  summaryAr: string
  draftSubject: string
  draftBody: string
  extract: {
    dates: string[]
    times: string[]
    names: string[]
    important: string[]
  }
  triage: 'urgent' | 'action' | 'fyi' | 'noise'
  analyzedAt: string
  fallbackNoteAr?: string
}

type AttachmentHit = Msg & { attachments: AttachmentMeta[] }

const FOLDERS = [
  { id: 'INBOX', label: 'الوارد' },
  { id: 'UNREAD', label: 'غير مقروء' },
  { id: 'STARRED', label: 'مهمّة' },
  { id: 'SENT', label: 'المرسل' },
  { id: 'ALL', label: 'الكل' },
] as const

const TRIAGE_AR: Record<Intel['triage'], string> = {
  urgent: 'عاجل',
  action: 'يحتاج إجراء',
  fyi: 'للاطلاع',
  noise: 'ضوضاء',
}

/**
 * Full personal Gmail client — separate from org IMAP «بريد الجمعية».
 * Privacy: only the signed-in user's Google mailbox.
 */
export function PersonalMailPanel({ compact }: { compact?: boolean }) {
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [selected, setSelected] = useState<MsgDetail | null>(null)
  const [folder, setFolder] = useState<(typeof FOLDERS)[number]['id']>('INBOX')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [warningAr, setWarningAr] = useState('')
  const [connecting, setConnecting] = useState(false)

  const [corpusQ, setCorpusQ] = useState('')
  const [corpusHits, setCorpusHits] = useState<Msg[]>([])
  const [attachHits, setAttachHits] = useState<AttachmentHit[]>([])
  const [corpusNote, setCorpusNote] = useState('')

  const [intel, setIntel] = useState<Intel | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyHtml, setReplyHtml] = useState('')
  const [replySubject, setReplySubject] = useState('')
  const [composing, setComposing] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeText, setComposeText] = useState('')
  const [composeHtml, setComposeHtml] = useState('')

  const readingRef = useRef<HTMLDivElement>(null)
  const replyRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        folder,
        limit: '40',
      })
      const res = await fetch(`/api/mail/personal?${params}`, {
        headers: await authHeaders(),
      })
      const data = await res.json()
      if (!res.ok) {
        setConnected(false)
        setMessages([])
        setError(data.error || 'تعذّر تحميل البريد الشخصي')
        return
      }
      setConnected(Boolean(data.connected))
      setEmail(data.email || null)
      setMessages(data.messages || [])
      setWarningAr(data.warningAr || '')
      try {
        window.dispatchEvent(new Event('ab-personal-mail-changed'))
      } catch {
        /* ignore */
      }
    } catch {
      setError('تعذّر الاتصال')
    } finally {
      setLoading(false)
    }
  }, [folder])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function connect() {
    setConnecting(true)
    setError('')
    try {
      await connectGoogleGmail()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر بدء ربط Google')
      setConnecting(false)
    }
  }

  async function openMessage(id: string) {
    setBusy('read')
    setError('')
    setIntel(null)
    setOkMsg('')
    try {
      const res = await fetch('/api/mail/personal', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'get', messageId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'تعذّر فتح الرسالة')
      const msg = data.message as MsgDetail
      setSelected(msg)
      setComposing(false)
      setReplySubject(
        msg.subject?.match(/^re:/i) ? msg.subject : `Re: ${msg.subject || ''}`
      )
      setReplyText('')
      setReplyHtml('')
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, unread: false } : m))
      )
      requestAnimationFrame(() =>
        readingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر فتح الرسالة')
    } finally {
      setBusy('')
    }
  }

  async function runCorpusSearch() {
    const q = corpusQ.trim()
    if (!q) return
    setBusy('search')
    setCorpusNote('')
    setCorpusHits([])
    setAttachHits([])
    try {
      const headers = await authHeaders({ 'Content-Type': 'application/json' })
      const [searchRes, attachRes] = await Promise.all([
        fetch('/api/mail/personal', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'search_messages',
            query: q,
            maxResults: 25,
          }),
        }),
        fetch('/api/mail/personal', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'attachments',
            query: q,
            maxResults: 12,
          }),
        }),
      ])
      const searchData = await searchRes.json()
      const attachData = await attachRes.json()
      if (!searchRes.ok) throw new Error(searchData.error || 'فشل البحث')
      setCorpusHits(searchData.messages || [])
      setAttachHits(attachData.messages || [])
      setCorpusNote(
        `نتائج البحث: ${searchData.messages?.length || 0} رسالة · ${
          attachData.messages?.length || 0
        } بمرفقات`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل البحث')
    } finally {
      setBusy('')
    }
  }

  async function analyzeSelected(mode: 'summary' | 'draft') {
    if (!selected) return
    setBusy('analyze')
    setError('')
    try {
      const res = await fetch('/api/mail/personal', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'analyze', messageId: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل التحليل')
      const next = data.intel as Intel
      setIntel(next)
      if (mode === 'draft' || next.draftBody) {
        setReplySubject(next.draftSubject)
        setReplyText(next.draftBody)
        setReplyHtml(plainTextToMailHtml(next.draftBody))
        requestAnimationFrame(() =>
          replyRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          })
        )
      }
      setOkMsg(
        mode === 'draft'
          ? 'مسودة الرد جاهزة — راجعها ثم أرسل أو عدّل.'
          : 'تم التلخيص.'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحليل')
    } finally {
      setBusy('')
    }
  }

  async function sendReply(sendNow = false) {
    if (!selected) return
    const text = replyText.trim()
    const html = replyHtml.trim()
    if (!text && !html) {
      if (sendNow && intel?.draftBody) {
        setReplyText(intel.draftBody)
        setReplyHtml(plainTextToMailHtml(intel.draftBody))
      } else {
        setError('اكتب نص الرد أو اطلب مسودة بالذكاء أولاً.')
        return
      }
    }
    setBusy('send')
    setError('')
    try {
      const bodyText = (replyText.trim() || intel?.draftBody || '').trim()
      const bodyHtml = (
        replyHtml.trim() || plainTextToMailHtml(bodyText)
      ).trim()
      const res = await fetch('/api/mail/personal', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'reply',
          messageId: selected.id,
          subject: replySubject || intel?.draftSubject,
          bodyText,
          bodyHtml,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الإرسال')
      setOkMsg(data.messageAr || 'أُرسل الرد.')
      setReplyText('')
      setReplyHtml('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الإرسال')
    } finally {
      setBusy('')
    }
  }

  async function sendCompose() {
    const to = composeTo.trim()
    const subject = composeSubject.trim()
    const bodyText = composeText.trim()
    if (!to || !subject || !bodyText) {
      setError('أكمل: إلى، الموضوع، والنص.')
      return
    }
    setBusy('send')
    setError('')
    try {
      const res = await fetch('/api/mail/personal', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'send',
          to,
          subject,
          bodyText,
          bodyHtml: composeHtml.trim() || plainTextToMailHtml(bodyText),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الإرسال')
      setOkMsg(data.messageAr || 'أُرسلت الرسالة.')
      setComposing(false)
      setComposeTo('')
      setComposeSubject('')
      setComposeText('')
      setComposeHtml('')
      void refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الإرسال')
    } finally {
      setBusy('')
    }
  }

  async function toggleStar(msg: Msg) {
    try {
      const res = await fetch('/api/mail/personal', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'star',
          messageId: msg.id,
          starred: !msg.starred,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'تعذّر تحديث النجمة')
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, starred: !msg.starred } : m
        )
      )
      if (selected?.id === msg.id) {
        setSelected({ ...selected, starred: !msg.starred })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تحديث النجمة')
    }
  }

  function closeReading() {
    setSelected(null)
    setIntel(null)
  }

  const showListOnMobile = !selected && !composing

  if (compact) {
    return (
      <section
        className="rounded-md border border-ab-border/80 bg-stone-50/80 px-2.5 py-2"
        dir="rtl"
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-ab-ink/70" aria-hidden />
          <h3 className="text-[12px] font-semibold text-ab-ink">
            بريدي الشخصي
          </h3>
          <button
            type="button"
            className="ms-auto rounded p-1 text-ab-muted-soft hover:bg-stone-200"
            onClick={() => void refresh()}
            aria-label="تحديث"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden
            />
          </button>
        </div>
        <p className="mb-2 text-[10px] text-stone-500">
          {PERSONAL_DESK_COPY.mailOrgVsPersonalAr}
        </p>
        {!connected ? (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={connecting}
            className="inline-flex items-center gap-1.5 rounded-md bg-ab-ink px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-60"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            {connecting ? 'جاري الربط…' : 'اربط بريدي في Google'}
          </button>
        ) : (
          <div className="space-y-1">
            <p className="text-[10px] text-stone-600" dir="ltr">
              {email}
            </p>
            <ul className="max-h-28 space-y-1 overflow-y-auto">
              {messages.slice(0, 5).map((m) => (
                <li key={m.id} className="truncate text-[11px] text-ab-ink">
                  {m.unread ? '● ' : ''}
                  {m.subject || 'بدون موضوع'}
                </li>
              ))}
            </ul>
            <a
              href="/?section=personal-mail"
              className="text-[10px] font-semibold text-ab-accent hover:underline"
            >
              فتح نافذة البريد الشخصي ←
            </a>
          </div>
        )}
        {error ? (
          <p className="mt-1 text-[10px] text-amber-800">{error}</p>
        ) : null}
      </section>
    )
  }

  return (
    <section className="ab-page" dir="rtl">
      <header className="ab-page-head">
        <div className="min-w-0">
          <h2 className="ab-title flex items-center gap-2">
            <Mail className="h-5 w-5 text-ab-accent" aria-hidden />
            نافذة البريد الشخصي
            {messages.filter((m) => m.unread).length > 0 && (
              <span className="rounded-full bg-ab-ink px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">
                {messages.filter((m) => m.unread).length} غير مقروء
              </span>
            )}
          </h2>
          <p className="ab-subtitle">
            بريدك في Google فقط — منفصل عن بريد الجمعية. ابحث في كل الرسائل
            والمرفقات، لخّص، اكتب رداً بالذكاء ثم راجع أو أرسل فوراً.
          </p>
        </div>
        <div className="ab-page-head-actions">
          {connected && (
            <>
              <button
                type="button"
                onClick={() => {
                  setComposing(true)
                  setSelected(null)
                }}
                className="ab-btn-secondary"
              >
                <PenSquare className="h-3.5 w-3.5" aria-hidden />
                رسالة جديدة
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void refresh()}
                className="ab-btn-ghost"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                  aria-hidden
                />
                حدّث
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void connect()}
            disabled={connecting}
            className="ab-btn-secondary"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            {connected
              ? 'أعد الربط / حساب إضافي'
              : connecting
                ? 'جاري الربط…'
                : 'اربط بريدي في Google'}
          </button>
        </div>
      </header>

      {error && (
        <p className="ab-note-danger" role="alert">
          {error}
        </p>
      )}
      {warningAr && (
        <p className="ab-note-warn" role="status">
          {warningAr}
        </p>
      )}
      {okMsg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {okMsg}
        </p>
      )}

      {!connected && !loading && (
        <div className="mx-auto max-w-md space-y-3 rounded-xl border border-dashed border-ab-border bg-stone-50 px-4 py-8 text-center">
          <Mail className="mx-auto h-8 w-8 text-ab-accent" aria-hidden />
          <h3 className="text-sm font-bold text-ab-ink">
            اربط بريدك في Google
          </h3>
          <p className="text-[12px] leading-relaxed text-stone-600">
            {PERSONAL_DESK_COPY.mailOrgVsPersonalAr}
          </p>
          <p className="text-[11px] text-stone-500">
            ستظهر شاشة موافقة Google لصلاحيات القراءة والإرسال وتعديل التسميات
            (gmail.readonly / send / modify). إن كان التطبيق في وضع الاختبار،
            أضف بريدك كـ Test user في Google Cloud.
          </p>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-lg bg-ab-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Link2 className="h-4 w-4" aria-hidden />
            {connecting ? 'جاري التحويل إلى Google…' : 'اربط بريدي في Google'}
          </button>
        </div>
      )}

      {connected && (
        <>
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-ab-border/80 bg-stone-50/90 px-3 py-1.5 text-[11px] text-stone-600"
            role="status"
          >
            <span className="font-semibold text-ab-ink">Gmail الشخصي</span>
            <span dir="ltr" className="font-mono text-[10px]">
              {email}
            </span>
            <span className="text-emerald-800">خاص بك وحدك</span>
          </div>

          <div className="space-y-2 rounded-xl border border-ab-border bg-white p-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ab-ink">
              <FileSearch className="h-3.5 w-3.5 text-ab-accent" aria-hidden />
              بحث ذكي — كل البريد والمرفقات
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                className="min-w-[10rem] flex-1 rounded-lg border border-ab-border px-2.5 py-1.5 text-sm"
                value={corpusQ}
                onChange={(e) => setCorpusQ(e.target.value)}
                placeholder="كلمة، اسم، ملف، has:attachment…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runCorpusSearch()
                }}
              />
              <button
                type="button"
                disabled={busy === 'search' || !corpusQ.trim()}
                onClick={() => void runCorpusSearch()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Search className="h-3.5 w-3.5" aria-hidden />
                {busy === 'search' ? '…' : 'ابحث'}
              </button>
            </div>
            {corpusNote && (
              <p className="text-[10px] text-stone-500">{corpusNote}</p>
            )}
            {corpusHits.length > 0 && (
              <ul className="max-h-36 space-y-0.5 overflow-y-auto">
                {corpusHits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1 text-right hover:bg-stone-50"
                      onClick={() => void openMessage(h.id)}
                    >
                      <span className="block truncate text-[11px] font-medium text-ab-ink">
                        {h.subject || 'بدون موضوع'}
                      </span>
                      <span className="block truncate text-[10px] text-stone-500">
                        {h.snippet}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {attachHits.length > 0 && (
              <div className="border-t border-ab-border/60 pt-1.5">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-stone-600">
                  <Paperclip className="h-3 w-3" aria-hidden />
                  مرفقات مطابقة
                </p>
                <ul className="max-h-28 space-y-0.5 overflow-y-auto">
                  {attachHits.map((h) => (
                    <li key={`att-${h.id}`}>
                      <button
                        type="button"
                        className="w-full rounded px-2 py-1 text-right hover:bg-stone-50"
                        onClick={() => void openMessage(h.id)}
                      >
                        <span className="block truncate text-[11px] text-ab-ink">
                          {h.attachments.map((a) => a.filename).join(' · ')}
                        </span>
                        <span className="block truncate text-[10px] text-stone-500">
                          {h.subject}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(11rem,16rem)_minmax(0,1fr)] md:items-start md:gap-3">
            <div
              className={`space-y-1.5 ${showListOnMobile ? '' : 'hidden md:block'}`}
            >
              <div className="flex flex-wrap gap-1">
                {FOLDERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFolder(f.id)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                      folder === f.id
                        ? 'bg-ab-ink text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <ul
                className="max-h-[min(70dvh,36rem)] space-y-0.5 overflow-y-auto overscroll-contain md:sticky md:top-3 md:max-h-[calc(100dvh-7rem)]"
                aria-label="صندوق البريد الشخصي"
              >
                {messages.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => void openMessage(m.id)}
                      className={`w-full rounded-md border px-2 py-1.5 text-right transition ${
                        selected?.id === m.id
                          ? 'border-ab-accent bg-ab-accent/5'
                          : 'border-ab-border/70 bg-white hover:bg-stone-50'
                      } ${m.unread ? 'font-semibold' : ''}`}
                    >
                      <div className="flex items-center gap-1.5">
                        {m.unread && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-ab-accent"
                            aria-hidden
                          />
                        )}
                        {m.starred && (
                          <Star
                            className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500"
                            aria-hidden
                          />
                        )}
                        {m.hasAttachment && (
                          <Paperclip
                            className="h-3 w-3 shrink-0 text-stone-400"
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[12px] text-ab-ink">
                          {m.subject || '(بدون موضوع)'}
                        </span>
                      </div>
                      <div
                        className="mt-0.5 truncate text-[10px] text-stone-500"
                        dir="ltr"
                      >
                        {m.from}
                      </div>
                      <div className="mt-0.5 line-clamp-1 text-[10px] text-ab-muted-soft">
                        {m.snippet}
                      </div>
                    </button>
                  </li>
                ))}
                {!loading && messages.length === 0 && (
                  <li className="ab-empty !py-6">
                    <Inbox className="mx-auto h-5 w-5 text-stone-400" />
                    <p className="mt-1 text-xs text-stone-500">لا رسائل هنا</p>
                  </li>
                )}
              </ul>
            </div>

            <div
              ref={readingRef}
              className={`min-h-[14rem] space-y-2 rounded-xl border border-ab-border bg-white p-3 shadow-ab-sm md:sticky md:top-3 md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto ${
                selected || composing ? '' : 'hidden md:block'
              }`}
            >
              {composing ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-ab-ink">
                      رسالة جديدة
                    </h3>
                    <button
                      type="button"
                      onClick={() => setComposing(false)}
                      className="rounded p-1 text-stone-500 hover:bg-stone-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    dir="ltr"
                    className="w-full rounded-lg border border-ab-border px-2 py-1.5 font-mono text-xs"
                    placeholder="إلى"
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-ab-border px-2 py-1.5 text-sm"
                    placeholder="الموضوع"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                  />
                  <MailRichComposer
                    content={composeHtml || composeText}
                    onChange={({ html, text }) => {
                      setComposeHtml(html)
                      setComposeText(text)
                    }}
                    placeholder="نص الرسالة…"
                  />
                  <button
                    type="button"
                    disabled={busy === 'send'}
                    onClick={() => void sendCompose()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ab-accent px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    أرسل
                  </button>
                </div>
              ) : !selected ? (
                <p className="text-sm text-ab-muted">
                  اختر رسالة من القائمة — أو ابحث في كل بريدك — ثم لخّص أو اكتب
                  رداً.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[15px] font-bold text-ab-ink">
                        {selected.subject}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-stone-500" dir="ltr">
                        من: {selected.from}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void toggleStar(selected)}
                        className="rounded p-1.5 hover:bg-stone-100"
                        aria-label="نجمة"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            selected.starred
                              ? 'fill-amber-400 text-amber-500'
                              : 'text-stone-400'
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={closeReading}
                        className="inline-flex items-center gap-1 rounded-lg border border-ab-border px-2 py-1 text-[11px] md:hidden"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        الوارد
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={busy === 'analyze'}
                      onClick={() => void analyzeSelected('summary')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-ab-border bg-stone-50 px-2.5 py-2 text-xs font-bold text-ab-ink hover:border-ab-accent/40 disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-ab-accent" />
                      لخّص
                    </button>
                    <button
                      type="button"
                      disabled={busy === 'analyze'}
                      onClick={() => void analyzeSelected('draft')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-ab-border bg-stone-50 px-2.5 py-2 text-xs font-bold text-ab-ink hover:border-ab-accent/40 disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5 text-ab-accent" />
                      اكتب رد بالذكاء
                    </button>
                  </div>

                  {intel?.summaryAr && (
                    <div className="rounded-lg border border-ab-accent/20 bg-ab-accent/5 p-2.5">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-semibold text-ab-ink">
                          ملخص الوكيل
                        </p>
                        <span className="rounded bg-white/80 px-1.5 py-0.5 text-[9px] font-semibold text-stone-600">
                          {TRIAGE_AR[intel.triage]}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-stone-700">
                        {intel.summaryAr}
                      </p>
                      {intel.fallbackNoteAr && (
                        <p className="mt-1 text-[10px] text-amber-800">
                          {intel.fallbackNoteAr}
                        </p>
                      )}
                    </div>
                  )}

                  {selected.attachments?.length > 0 && (
                    <div className="rounded-lg border border-ab-border/70 bg-stone-50 px-2 py-1.5">
                      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-stone-600">
                        <Paperclip className="h-3 w-3" />
                        مرفقات ({selected.attachments.length})
                      </p>
                      <ul className="space-y-0.5">
                        {selected.attachments.map((a) => (
                          <li
                            key={a.attachmentId}
                            className="truncate font-mono text-[10px] text-stone-700"
                            dir="ltr"
                          >
                            {a.filename}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div
                    className="max-h-48 overflow-y-auto rounded-lg border border-ab-border/60 bg-stone-50/50 p-2.5 text-[12px] leading-relaxed text-stone-800 whitespace-pre-wrap"
                    dir="auto"
                  >
                    {selected.bodyText || selected.snippet}
                  </div>

                  <div
                    ref={replyRef}
                    className="space-y-2 rounded-xl border-2 border-ab-accent/30 bg-ab-accent/[0.03] p-2.5"
                  >
                    <p className="flex items-center gap-1.5 text-xs font-bold text-ab-ink">
                      <Send className="h-3.5 w-3.5 text-ab-accent" />
                      نافذة الرد
                    </p>
                    <input
                      className="w-full rounded-lg border border-ab-border px-2 py-1 text-xs"
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      placeholder="موضوع الرد"
                    />
                    <MailRichComposer
                      content={replyHtml || replyText}
                      onChange={({ html, text }) => {
                        setReplyHtml(html)
                        setReplyText(text)
                      }}
                      placeholder="نص الرد — أو اطلب مسودة بالذكاء أعلاه"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy === 'send'}
                        onClick={() => void sendReply(false)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-ab-accent px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        أرسل بعد المراجعة
                      </button>
                      <button
                        type="button"
                        disabled={busy === 'send' || busy === 'analyze'}
                        onClick={() => void sendReply(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-ab-ink px-3 py-1.5 text-[11px] font-bold text-ab-ink disabled:opacity-50"
                      >
                        أرسل فوراً
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
