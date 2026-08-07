'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Inbox,
  Mail,
  RefreshCw,
  Send,
  Settings2,
  ShieldAlert,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'

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

type MsgDetail = Msg & {
  bodyText: string
  bodyHtml?: string | null
  cc?: string
}

const DEFAULT_EMAIL = 'info@alhuda-alhikma.sa'

/**
 * Owner IMAP/SMTP mailbox + on-site inbox (AR/EN).
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
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Parallel: don't block the inbox list on settings latency.
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

  // Soft background IMAP sync — abort if Netlify/IMAP hangs past budget.
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
        /* ignore timeout / network */
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
      if (!res.ok && !data.ok) throw new Error(data.errorAr || data.error || data.messageAr)
      setOkMsg(data.messageAr || 'تمت المزامنة')
      await loadMessages()
      await loadSettings()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل المزامنة')
    } finally {
      setBusy('')
    }
  }

  async function openMessage(id: string) {
    setBusy('read')
    setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/mail/messages/${id}`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'تعذّر القراءة')
      const m = data.message as MsgDetail
      setSelected(m)
      setReplyText('')
      setReplySubject(
        m.subject?.match(/^(re|رد)\s*:/i) ? m.subject : `Re: ${m.subject || ''}`
      )
      await loadMessages()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ')
    } finally {
      setBusy('')
    }
  }

  async function sendReply() {
    if (!selected || !isOwner) return
    setBusy('send')
    setError('')
    setOkMsg('')
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
      if (!res.ok) throw new Error(data.error || 'فشل الإرسال')
      setOkMsg(data.messageAr || 'أُرسل الرد')
      setReplyText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الإرسال')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="ab-page" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="ab-title flex items-center gap-2">
            <Mail className="h-5 w-5 text-ab-accent" aria-hidden />
            بريد الجمعية
          </h2>
          <p className="ab-subtitle">
            IMAP/SMTP لـ {DEFAULT_EMAIL} — قراءة عربية/إنجليزية، ومزامنة مع إشعار
            تيليجرام.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
      </div>

      {mailbox?.lastErrorAr && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {mailbox.lastErrorAr}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}
      {okMsg && (
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

      <div className="grid gap-4 lg:grid-cols-5">
        <ul className="space-y-1 lg:col-span-2">
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
                <div className="truncate text-sm text-ab-ink">
                  {m.subject || '(بدون موضوع)'}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-stone-500" dir="ltr">
                  {m.from}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11px] text-stone-400">
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

        <div className="min-h-[16rem] rounded-xl border border-ab-border bg-white p-4 shadow-ab-sm lg:col-span-3">
          {!selected ? (
            <p className="text-sm text-ab-muted">اختر رسالة لعرضها.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-bold text-ab-ink">
                  {selected.subject}
                </h3>
                <p className="mt-1 text-xs text-stone-500" dir="ltr">
                  من: {selected.from}
                  <br />
                  إلى: {selected.to}
                </p>
              </div>
              <pre
                dir="auto"
                className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-stone-700"
              >
                {selected.bodyText || selected.snippet}
              </pre>
              {isOwner && (
                <div className="space-y-2 border-t border-ab-border pt-3">
                  <label className="block text-xs">
                    <span className="text-stone-500">موضوع الرد</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-ab-border px-2 py-1.5 text-sm"
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="text-stone-500">نص الرد</span>
                    <textarea
                      rows={5}
                      className="mt-1 w-full rounded-lg border border-ab-border px-2 py-1.5 text-sm"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="اكتب الرد بالعربية أو الإنجليزية…"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy === 'send' || !replyText.trim()}
                    onClick={() => void sendReply()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    أرسل الرد عبر SMTP
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
