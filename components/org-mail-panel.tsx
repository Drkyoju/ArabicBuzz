'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  Inbox,
  Link2,
  Mail,
  MessageCircleQuestion,
  Paperclip,
  RefreshCw,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { ORG_REPLY_TEMPLATES } from '@/lib/email/org-reply-templates'

type MailboxPublic = {
  id: string
  labelAr: string
  emailAddress: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  username: string
  passwordHint: string | null
  hasPassword: boolean
  enabled: boolean
  notifyTelegram: boolean
  lastSyncAt: string | null
  lastErrorAr: string | null
  configured: boolean
}

type Msg = {
  id: string
  subject: string
  from: string
  to: string
  date: string | null
  snippet: string
  seen: boolean
}

type AttachmentView = {
  id: string
  filename: string
  mimeType: string
  size: number
  hasText: boolean
  extractMethod: string | null
  extractNoteAr: string | null
  ocrUsed: boolean
  textPreview: string | null
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
  analyzedAt: string
  fallbackNoteAr?: string
}

type MsgDetail = Msg & {
  bodyText: string
  bodyHtml?: string | null
  cc?: string
  attachments?: AttachmentView[]
  intel?: Intel | null
}

type RelatedHit = {
  kind: string
  titleAr: string
  snippet: string
  href?: string
}

type DeliveryBanner = {
  ok: boolean
  status: 'smtp_accepted' | 'smtp_rejected' | 'error'
  messageAr: string
}

const DEFAULT_EMAIL = 'info@alhuda-alhikma.sa'

/**
 * Org IMAP/SMTP mailbox — inbox + agent draft / extract / ask.
 * Members and owner can read/analyze/send; only owner edits IMAP settings.
 */
export function OrgMailPanel({ isOwner = false }: { isOwner?: boolean }) {
  const [mailbox, setMailbox] = useState<MailboxPublic | null>(null)
  const [configured, setConfigured] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [unread, setUnread] = useState(0)
  const [selected, setSelected] = useState<MsgDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [delivery, setDelivery] = useState<DeliveryBanner | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const [emailAddress, setEmailAddress] = useState(DEFAULT_EMAIL)
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState(993)
  const [imapSecure, setImapSecure] = useState(true)
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(465)
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [username, setUsername] = useState(DEFAULT_EMAIL)
  const [password, setPassword] = useState('')
  const [notifyTelegram, setNotifyTelegram] = useState(true)

  const [replyText, setReplyText] = useState('')
  const [replySubject, setReplySubject] = useState('')
  const [draftAccepted, setDraftAccepted] = useState(false)
  const [intel, setIntel] = useState<Intel | null>(null)
  const [askQ, setAskQ] = useState('')
  const [askA, setAskA] = useState('')
  const [related, setRelated] = useState<RelatedHit[]>([])

  const readingRef = useRef<HTMLDivElement>(null)
  const replyRef = useRef<HTMLDivElement>(null)

  const loadSettings = useCallback(async () => {
    const headers = await authHeaders()
    const res = await fetch('/api/mail/settings', { headers })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'تعذّر التحميل')
    setConfigured(Boolean(data.configured))
    const mb = data.mailbox as MailboxPublic | null
    setMailbox(mb)
    if (mb) {
      setEmailAddress(mb.emailAddress || DEFAULT_EMAIL)
      setImapHost(mb.imapHost || '')
      setImapPort(mb.imapPort || 993)
      setImapSecure(mb.imapSecure !== false)
      setSmtpHost(mb.smtpHost || '')
      setSmtpPort(mb.smtpPort || 465)
      setSmtpSecure(mb.smtpSecure !== false)
      setUsername(mb.username || mb.emailAddress || DEFAULT_EMAIL)
      setNotifyTelegram(mb.notifyTelegram !== false)
      setShowSettings(!mb.configured)
    } else {
      setShowSettings(true)
    }
  }, [])

  const loadMessages = useCallback(async () => {
    const headers = await authHeaders()
    const res = await fetch('/api/mail/messages?limit=50', { headers })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'تعذّر تحميل الرسائل')
    setMessages(data.messages || [])
    setUnread(Number(data.unread || 0))
    setConfigured(Boolean(data.configured))
    try {
      window.dispatchEvent(new Event('ab-mail-changed'))
    } catch {
      /* ignore */
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const results = await Promise.allSettled([loadSettings(), loadMessages()])
      const firstErr = results.find((r) => r.status === 'rejected')
      if (firstErr && firstErr.status === 'rejected') {
        setError(
          firstErr.reason instanceof Error
            ? firstErr.reason.message
            : 'خطأ'
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ')
    } finally {
      setLoading(false)
    }
  }, [loadMessages, loadSettings])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Deep-link ?msg=
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('msg')
      if (id) void openMessage(id)
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!configured) return
    let cancelled = false
    const ac = new AbortController()
    const kill = window.setTimeout(() => ac.abort(), 20_000)
    void (async () => {
      try {
        const headers = await authHeaders()
        const res = await fetch('/api/mail/sync', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: '{}',
          signal: ac.signal,
        })
        if (!cancelled && res.ok) await loadMessages()
      } catch {
        /* ignore */
      } finally {
        window.clearTimeout(kill)
      }
    })()
    return () => {
      cancelled = true
      ac.abort()
      window.clearTimeout(kill)
    }
  }, [configured, loadMessages])

  /** Bring reading+reply pane into the visible workspace (not under a tall list). */
  function revealReadingPane() {
    const pane = readingRef.current
    if (!pane) return
    try {
      pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } catch {
      /* ignore */
    }
    // Also reset the main scroll so mobile users are not left mid-list.
    try {
      const main = pane.closest('main') || document.scrollingElement
      if (main && 'scrollTop' in main) {
        const top = pane.getBoundingClientRect().top + window.scrollY - 72
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      }
    } catch {
      /* ignore */
    }
  }

  async function saveSettings() {
    if (!isOwner) return
    setBusy('save')
    setError('')
    setOkMsg('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/mail/settings', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailAddress,
          imapHost,
          imapPort,
          imapSecure,
          smtpHost,
          smtpPort,
          smtpSecure,
          username,
          password: password || undefined,
          notifyTelegram,
          test: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الحفظ')
      setPassword('')
      setMailbox(data.mailbox)
      setConfigured(true)
      const parts = [data.messageAr]
      if (data.imapTest?.messageAr) parts.push(data.imapTest.messageAr)
      if (data.smtpTest?.messageAr) parts.push(data.smtpTest.messageAr)
      setOkMsg(parts.filter(Boolean).join(' · '))
      await loadMessages()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ')
    } finally {
      setBusy('')
    }
  }

  async function syncNow() {
    setBusy('sync')
    setError('')
    setOkMsg('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/mail/sync', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok && !data.ok)
        throw new Error(data.errorAr || data.error || data.messageAr)
      setOkMsg(data.messageAr || 'تمت المزامنة')
      await loadMessages()
      await loadSettings()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل المزامنة')
    } finally {
      setBusy('')
    }
  }

  async function runAnalyze(id: string, force = false) {
    setBusy('analyze')
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/mail/messages/${id}/analyze`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل التحليل')
      const i = data.intel as Intel
      setIntel(i)
      if (!draftAccepted) {
        setReplySubject(i.draftSubject || '')
        setReplyText(i.draftBody || '')
      }
      return i
    } finally {
      setBusy('')
    }
  }

  async function loadRelated(id: string) {
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/mail/messages/${id}/related`, { headers })
      const data = await res.json()
      if (res.ok) setRelated(data.hits || [])
      else setRelated([])
    } catch {
      setRelated([])
    }
  }

  async function openMessage(id: string) {
    setBusy('read')
    setError('')
    setAskA('')
    setAskQ('')
    setDraftAccepted(false)
    setDelivery(null)
    setRelated([])
    // Show reading pane immediately (mobile swaps away from the tall list).
    setSelected((prev) =>
      prev?.id === id
        ? prev
        : ({
            id,
            subject: '…',
            from: '',
            to: '',
            date: null,
            snippet: '',
            seen: true,
            bodyText: '',
          } as MsgDetail)
    )
    requestAnimationFrame(() => revealReadingPane())
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/mail/messages/${id}`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'تعذّر القراءة')
      const m = data.message as MsgDetail
      setSelected(m)
      const existing = m.intel || null
      setIntel(existing)
      if (existing?.draftBody) {
        setReplySubject(existing.draftSubject)
        setReplyText(existing.draftBody)
      } else {
        setReplyText('')
        setReplySubject(
          m.subject?.match(/^(re|رد)\s*:/i)
            ? m.subject
            : `Re: ${m.subject || ''}`
        )
      }
      await loadMessages()
      void loadRelated(id)
      requestAnimationFrame(() => {
        revealReadingPane()
        replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
      if (!existing?.draftBody) {
        void runAnalyze(id).catch((e) =>
          setError(e instanceof Error ? e.message : 'فشل التحليل')
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ')
      setSelected(null)
    } finally {
      setBusy('')
    }
  }

  async function sendReply() {
    if (!selected) return
    setBusy('send')
    setError('')
    setOkMsg('')
    setDelivery(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selected.from,
          subject: replySubject,
          bodyText: replyText,
          replyToMessageId: selected.id,
          forceSend: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.error || 'فشل الإرسال'
        setDelivery({
          ok: false,
          status: 'smtp_rejected',
          messageAr: msg,
        })
        throw new Error(msg)
      }
      const note = [data.messageAr, data.deliveryNoteAr]
        .filter(Boolean)
        .join(' — ')
      setDelivery({
        ok: true,
        status: 'smtp_accepted',
        messageAr:
          note ||
          'قَبِل خادم SMTP الرسالة. هذا ليس إيصال وصول إلى صندوق المستلم.',
      })
      setOkMsg(note || 'أُرسل الرد')
      setReplyText('')
      setDraftAccepted(false)
      await loadMessages()
      requestAnimationFrame(() =>
        replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الإرسال')
    } finally {
      setBusy('')
    }
  }

  async function askAbout() {
    if (!selected || !askQ.trim()) return
    setBusy('ask')
    setAskA('')
    setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/mail/messages/${selected.id}/ask`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: askQ }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل السؤال')
      setAskA(data.answerAr || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل السؤال')
    } finally {
      setBusy('')
    }
  }

  function discardDraft() {
    setReplyText('')
    setReplySubject(
      selected?.subject?.match(/^(re|رد)\s*:/i)
        ? selected.subject
        : `Re: ${selected?.subject || ''}`
    )
    setDraftAccepted(false)
    setOkMsg('أُهملت مسودة الرد.')
  }

  function acceptDraft() {
    if (!intel) return
    setReplySubject(intel.draftSubject)
    setReplyText(intel.draftBody)
    setDraftAccepted(true)
    setOkMsg('قُبلت المسودة — يمكنك تعديلها ثم الإرسال.')
    requestAnimationFrame(() =>
      replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    )
  }

  function closeReading() {
    setSelected(null)
    setIntel(null)
    setDelivery(null)
  }

  const extract = intel?.extract
  const showListOnMobile = !selected

  return (
    <section className="ab-page" dir="rtl">
      <header className="ab-page-head">
        <div className="min-w-0">
          <h2 className="ab-title flex items-center gap-2">
            <Mail className="h-5 w-5 text-ab-accent" aria-hidden />
            بريد الجمعية
            {unread > 0 && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">
                {unread} جديد
              </span>
            )}
          </h2>
          <p className="ab-subtitle">
            افتح الرسالة ليصلك ملخص الوكيل ومسودة رد جاهزة للقبول أو التعديل.
          </p>
        </div>
        <div className="ab-page-head-actions">
          {isOwner && (
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="ab-btn-secondary"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              إعدادات الربط
            </button>
          )}
          {configured && (
            <button
              type="button"
              disabled={busy === 'sync'}
              onClick={() => void syncNow()}
              className="ab-btn-ghost"
              title="اختياري — المزامنة تعمل بالخلفية"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`}
                aria-hidden
              />
              حدّث الوارد
            </button>
          )}
        </div>
      </header>

      {mailbox?.lastErrorAr && (
        <p className="ab-note-warn flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {mailbox.lastErrorAr}
        </p>
      )}
      {error && (
        <p className="ab-note-danger" role="alert">
          {error}
        </p>
      )}
      {okMsg && !delivery && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {okMsg}
        </p>
      )}

      {showSettings && isOwner && (
        <div className="space-y-3 rounded-xl border border-ab-border bg-white p-4">
          <h3 className="text-sm font-semibold text-ab-ink">
            بريد الجمعية — إعداد مرة واحدة
          </h3>
          <p className="text-[11px] leading-relaxed text-stone-500">
            بعدها المزامنة والتنبيهات تعمل تلقائياً. يكفي البريد + كلمة مرور
            التطبيق + المضيف (المنافذ الافتراضية 993/465).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs sm:col-span-2">
              <span className="text-stone-500">البريد</span>
              <input
                dir="ltr"
                className="mt-1 w-full rounded-lg border border-ab-border px-2 py-1.5 font-mono text-sm"
                value={emailAddress}
                onChange={(e) => {
                  const v = e.target.value
                  setEmailAddress(v)
                  setUsername(v)
                  const d = v.split('@')[1]
                  if (d) {
                    const h = `mail.${d}`
                    setImapHost(h)
                    setSmtpHost(h)
                  }
                }}
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="text-stone-500">مضيف البريد</span>
              <input
                dir="ltr"
                className="mt-1 w-full rounded-lg border border-ab-border px-2 py-1.5 font-mono text-sm"
                placeholder="mail.example.com"
                value={imapHost}
                onChange={(e) => {
                  setImapHost(e.target.value)
                  setSmtpHost(e.target.value)
                }}
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="text-stone-500">
                كلمة مرور التطبيق
                {mailbox?.passwordHint
                  ? ` (المحفوظ: ${mailbox.passwordHint})`
                  : ''}
              </span>
              <input
                dir="ltr"
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-ab-border px-2 py-1.5 font-mono text-sm"
                placeholder={
                  mailbox?.hasPassword
                    ? 'اتركه فارغاً للإبقاء على المحفوظ'
                    : '••••••••'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
          <details className="rounded-lg border border-dashed border-ab-border bg-stone-50 px-3 py-2 text-[11px] text-stone-600">
            <summary className="cursor-pointer font-medium">خيارات متقدمة</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block">
                اسم المستخدم
                <input
                  dir="ltr"
                  className="mt-1 w-full rounded border border-ab-border px-2 py-1 font-mono"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="block">
                مضيف SMTP
                <input
                  dir="ltr"
                  className="mt-1 w-full rounded border border-ab-border px-2 py-1 font-mono"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                />
              </label>
              <label className="block">
                منفذ IMAP
                <input
                  dir="ltr"
                  type="number"
                  className="mt-1 w-full rounded border border-ab-border px-2 py-1 font-mono"
                  value={imapPort}
                  onChange={(e) => setImapPort(Number(e.target.value) || 993)}
                />
              </label>
              <label className="block">
                منفذ SMTP
                <input
                  dir="ltr"
                  type="number"
                  className="mt-1 w-full rounded border border-ab-border px-2 py-1 font-mono"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value) || 465)}
                />
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={imapSecure}
                  onChange={(e) => setImapSecure(e.target.checked)}
                />
                IMAP SSL
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={smtpSecure}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                />
                SMTP SSL
              </label>
              <label className="inline-flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={notifyTelegram}
                  onChange={(e) => setNotifyTelegram(e.target.checked)}
                />
                إشعار تيليجرام عند بريد جديد
              </label>
            </div>
          </details>
          <button
            type="button"
            disabled={busy === 'save'}
            onClick={() => void saveSettings()}
            className="rounded-lg bg-ab-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy === 'save' ? 'جاري الحفظ والاختبار…' : 'احفظ — ثم يعمل تلقائياً'}
          </button>
        </div>
      )}

      {!loading && !configured && !showSettings && (
        <p className="rounded-xl border border-dashed border-ab-border bg-stone-50 px-4 py-6 text-center text-sm text-stone-600">
          لم يُربط بريد بعد.
          {isOwner
            ? ' افتح «إعدادات الربط» وأدخل بيانات IMAP/SMTP.'
            : ' اطلب من المالك ضبط بريد الجمعية.'}
        </p>
      )}

      {configured && mailbox && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-ab-border/80 bg-stone-50/90 px-3 py-2 text-[11px] leading-snug text-stone-600"
          role="status"
        >
          <span className="inline-flex items-center gap-1.5 font-semibold text-ab-ink">
            <Mail className="h-3.5 w-3.5 text-ab-accent" aria-hidden />
            حالة SMTP/IMAP
          </span>
          <span dir="ltr" className="font-mono text-[10px] text-stone-500">
            {mailbox.emailAddress}
          </span>
          {mailbox.lastErrorAr ? (
            <span className="text-amber-800">آخر خطأ: {mailbox.lastErrorAr}</span>
          ) : (
            <span className="text-emerald-800">
              الربط محفوظ — الإرسال = قبول خادم SMTP فقط (ليس إيصال تسليم)
            </span>
          )}
          {mailbox.lastSyncAt && (
            <span className="text-ab-muted-soft">
              مزامنة {new Date(mailbox.lastSyncAt).toLocaleString('ar-SA')}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-stone-500">
        <Inbox className="h-3.5 w-3.5" aria-hidden />
        {loading
          ? 'جاري التحميل…'
          : `${messages.length} رسالة · ${unread} غير مقروءة${
              mailbox?.lastSyncAt
                ? ` · آخر مزامنة ${new Date(mailbox.lastSyncAt).toLocaleString('ar-SA')}`
                : ''
            }`}
      </div>

      {/*
        Split view from `md` (not `lg`): with the sidebar, content is often <1024px
        and a stacked list + pane put the reply ~2400px below. Mobile swaps to
        reading-only when a message is open.
      */}
      <div className="grid gap-3 md:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] md:items-start md:gap-4">
        <ul
          className={`max-h-[min(70dvh,36rem)] space-y-1 overflow-y-auto overscroll-contain md:sticky md:top-3 md:max-h-[calc(100dvh-7rem)] ${
            showListOnMobile ? '' : 'hidden md:block'
          }`}
          aria-label="صندوق الوارد"
        >
          {messages.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => void openMessage(m.id)}
                className={`w-full rounded-lg border px-3 py-2 text-right transition ${
                  selected?.id === m.id
                    ? 'border-ab-accent bg-ab-accent/5'
                    : 'border-ab-border bg-white hover:bg-stone-50'
                } ${!m.seen ? 'font-semibold' : ''}`}
              >
                <div className="flex items-center gap-2">
                  {!m.seen && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1 truncate text-sm text-ab-ink">
                    {m.subject || '(بدون موضوع)'}
                  </div>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-stone-500" dir="ltr">
                  {m.from}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11px] text-ab-muted-soft">
                  {m.snippet}
                </div>
              </button>
            </li>
          ))}
          {!loading && messages.length === 0 && configured && (
            <li className="ab-empty !py-8">
              <p className="text-xs font-semibold text-ab-ink">لا رسائل بعد</p>
              <p className="mt-1 text-[11px] text-ab-muted">
                اضغط «حدّث الوارد» لمزامنة صندوق الجمعية.
              </p>
            </li>
          )}
        </ul>

        <div
          ref={readingRef}
          id="org-mail-reading"
          className={`min-h-[16rem] space-y-3 rounded-xl border border-ab-border bg-white p-4 shadow-ab-sm md:sticky md:top-3 md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto ${
            selected ? '' : 'hidden md:block'
          }`}
        >
          {!selected ? (
            <p className="text-sm text-ab-muted">
              اختر رسالة من القائمة — يظهر هنا ملخص الوكيل ونافذة الرد فوراً بجانب
              الوارد (بدون التمرير لأسفل القائمة).
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-ab-ink">
                    {selected.subject}
                  </h3>
                  <p className="mt-1 text-xs text-stone-500" dir="ltr">
                    من: {selected.from}
                    {selected.to ? (
                      <>
                        <br />
                        إلى: {selected.to}
                      </>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeReading}
                  className="inline-flex items-center gap-1 rounded-lg border border-ab-border bg-stone-50 px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 md:hidden"
                >
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  الوارد
                </button>
                <button
                  type="button"
                  onClick={closeReading}
                  className="hidden items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-stone-500 hover:bg-stone-50 md:inline-flex"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  إغلاق
                </button>
              </div>

              {(busy === 'analyze' || busy === 'read') && (
                <p className="flex items-center gap-2 text-xs text-ab-accent">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" aria-hidden />
                  الوكيل يقرأ الرسالة ويجهّز المسودة…
                </p>
              )}

              {intel && (
                <div className="space-y-2 rounded-lg border border-ab-accent/20 bg-ab-accent/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-ab-ink">
                      ملخص الوكيل
                    </p>
                    <button
                      type="button"
                      className="text-[10px] text-stone-500 underline"
                      disabled={busy === 'analyze'}
                      onClick={() =>
                        void runAnalyze(selected.id, true).catch((e) =>
                          setError(
                            e instanceof Error ? e.message : 'فشل إعادة التحليل'
                          )
                        )
                      }
                    >
                      أعد التحليل
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed text-stone-700">
                    {intel.summaryAr}
                  </p>
                  {intel.fallbackNoteAr && (
                    <p className="text-[10px] text-amber-800">
                      {intel.fallbackNoteAr}
                    </p>
                  )}
                </div>
              )}

              {/* Reply window — directly under agent summary so it is never buried */}
              <div
                ref={replyRef}
                id="org-mail-reply"
                className="space-y-2 rounded-xl border-2 border-ab-accent/30 bg-ab-accent/[0.03] p-3"
              >
                <p className="flex items-center gap-1.5 text-sm font-bold text-ab-ink">
                  <Send className="h-4 w-4 text-ab-accent" aria-hidden />
                  نافذة الرد
                </p>
                <p className="text-[11px] leading-relaxed text-stone-600">
                  المسودة تُملأ تلقائياً. اضغط «قبول المسودة» أو عدّل النص ثم
                  «أرسل الرد».
                </p>

                {delivery && (
                  <div
                    role="status"
                    className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                      delivery.ok
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                        : 'border-red-200 bg-red-50 text-red-900'
                    }`}
                  >
                    <p className="font-semibold">
                      {delivery.ok
                        ? 'حالة الإرسال: قَبِل SMTP الرسالة'
                        : 'حالة الإرسال: فشل / رُفض'}
                    </p>
                    <p className="mt-1">{delivery.messageAr}</p>
                    {delivery.ok && (
                      <p className="mt-1 text-[10px] text-emerald-800/90">
                        تنبيه: قبول الخادم ≠ إيصال تسليم أو قراءة لدى المستلم —
                        لا يتوفر DSN في إعداد الجمعية الحالي.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!intel?.draftBody}
                    onClick={acceptDraft}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-900 disabled:opacity-40"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                    قبول المسودة
                  </button>
                  <button
                    type="button"
                    onClick={discardDraft}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-600"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    إهمال
                  </button>
                  {draftAccepted && (
                    <span className="self-center text-[10px] text-emerald-700">
                      جاهزة للتعديل/الإرسال
                    </span>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-[10px] font-semibold text-stone-500">
                    قوالب رد الجمعية
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ORG_REPLY_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setReplyText(t.bodyAr)
                          if (t.subjectHintAr) {
                            const base = selected?.subject || ''
                            const already =
                              base.match(/^(re|رد)\s*:/i) ||
                              base.includes(t.subjectHintAr)
                            setReplySubject(
                              already
                                ? base.startsWith('Re:') ||
                                  base.startsWith('رد')
                                  ? base
                                  : `Re: ${base}`
                                : `Re: ${t.subjectHintAr}`
                            )
                          }
                          setDraftAccepted(true)
                          setOkMsg(`أُدرج قالب «${t.labelAr}» — عدّل ثم أرسل.`)
                        }}
                        className="rounded-md border border-ab-border bg-stone-50 px-2 py-1 text-[10px] font-medium text-ab-ink hover:border-ab-accent/40 hover:bg-ab-accent/5"
                      >
                        {t.labelAr}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block text-xs">
                  <span className="text-stone-500">موضوع الرد</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-ab-border px-2 py-1.5 text-sm"
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-stone-500">نص الرد (عدّل ثم أرسل)</span>
                  <textarea
                    rows={6}
                    className="mt-1 w-full rounded-lg border border-ab-border px-2 py-1.5 text-sm"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="مسودة الوكيل أو قالب جاهز أو اكتب ردك…"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === 'send' || !replyText.trim()}
                    onClick={() => void sendReply()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ab-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    {busy === 'send' ? 'جاري الإرسال…' : 'أرسل الرد عبر SMTP'}
                  </button>
                </div>
                <p className="rounded-md bg-white/80 px-2 py-1.5 text-[10px] leading-relaxed text-stone-500">
                  <span className="font-semibold text-stone-700">حالة التسليم:</span>{' '}
                  نجاح الزر يعني «smtp_accepted» (قبل الخادم الرسالة). لا يوجد
                  DSN/إيصال قراءة في إعداد الجمعية الحالي — راقب صندوق الوارد أو
                  رسالة الخطأ عند الرفض.
                </p>
              </div>

              {extract &&
                (extract.dates.length > 0 ||
                  extract.times.length > 0 ||
                  extract.names.length > 0 ||
                  extract.important.length > 0) && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {extract.dates.length > 0 && (
                      <div className="rounded-lg bg-stone-50 p-2 text-[11px]">
                        <p className="font-semibold text-stone-600">تواريخ</p>
                        <ul className="mt-1 list-inside list-disc text-stone-700">
                          {extract.dates.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {extract.times.length > 0 && (
                      <div className="rounded-lg bg-stone-50 p-2 text-[11px]">
                        <p className="font-semibold text-stone-600">أوقات</p>
                        <ul className="mt-1 list-inside list-disc text-stone-700">
                          {extract.times.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {extract.names.length > 0 && (
                      <div className="rounded-lg bg-stone-50 p-2 text-[11px]">
                        <p className="font-semibold text-stone-600">أسماء</p>
                        <ul className="mt-1 list-inside list-disc text-stone-700">
                          {extract.names.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {extract.important.length > 0 && (
                      <div className="rounded-lg bg-stone-50 p-2 text-[11px] sm:col-span-2">
                        <p className="font-semibold text-stone-600">مهم</p>
                        <ul className="mt-1 list-inside list-disc text-stone-700">
                          {extract.important.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

              {(selected.attachments?.length ?? 0) > 0 && (
                <div className="space-y-2 rounded-lg border border-ab-border p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ab-ink">
                    <Paperclip className="h-3.5 w-3.5" aria-hidden />
                    المرفقات ({selected.attachments!.length})
                  </p>
                  {selected.attachments!.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-md bg-stone-50 px-2 py-1.5 text-[11px]"
                    >
                      <p className="font-medium text-ab-ink" dir="auto">
                        {a.filename}{' '}
                        <span className="font-normal text-ab-muted-soft" dir="ltr">
                          ({Math.round(a.size / 1024)} KB
                          {a.extractMethod ? ` · ${a.extractMethod}` : ''})
                        </span>
                      </p>
                      {a.textPreview ? (
                        <pre
                          dir="auto"
                          className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-stone-600"
                        >
                          {a.textPreview}
                        </pre>
                      ) : (
                        <p className="mt-1 text-amber-800">
                          {a.extractNoteAr ||
                            (a.ocrUsed
                              ? 'OCR لم يُرجع نصاً صالحاً.'
                              : 'لا نص مستخرج — لـ PDF الممسوح شغّل جسر الماك (npm run storage:sync + MAC_SYNC_URL) أو arabic_ocr.')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <details className="rounded-lg border border-ab-border bg-stone-50/80">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-ab-ink">
                  نص الرسالة الأصلي
                </summary>
                <pre
                  dir="auto"
                  className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-ab-border p-3 text-xs leading-relaxed text-stone-700"
                >
                  {selected.bodyText || selected.snippet || '…'}
                </pre>
              </details>

              {related.length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-dashed border-ab-border p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <Link2 className="h-3.5 w-3.5" aria-hidden />
                    ذو صلة (غرفة / ملفات / محادثة)
                  </p>
                  {related.map((h, i) => (
                    <a
                      key={`${h.kind}-${i}`}
                      href={h.href || '#'}
                      className="block rounded-md px-2 py-1 text-[11px] hover:bg-stone-50"
                    >
                      <span className="font-medium text-ab-accent">
                        {h.titleAr}
                      </span>
                      <span className="mt-0.5 block text-stone-500 line-clamp-2">
                        {h.snippet}
                      </span>
                    </a>
                  ))}
                </div>
              )}

              <div className="space-y-2 border-t border-ab-border pt-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-ab-ink">
                  <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden />
                  اسأل عن هذه الرسالة
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="min-w-[12rem] flex-1 rounded-lg border border-ab-border px-2 py-1.5 text-sm"
                    value={askQ}
                    onChange={(e) => setAskQ(e.target.value)}
                    placeholder="مثال: ما الموعد المذكور؟ أين الملف؟"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void askAbout()
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy === 'ask' || !askQ.trim()}
                    onClick={() => void askAbout()}
                    className="ab-btn-secondary"
                  >
                    اسأل
                  </button>
                </div>
                {askA && (
                  <p className="rounded-lg bg-stone-50 p-2 text-xs leading-relaxed text-stone-700">
                    {askA}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
