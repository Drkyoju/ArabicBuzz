'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { authHeaders, connectGoogleCalendar } from '@/lib/supabase/browser'
import { DEFAULT_DIRECTOR_EMAIL } from '@/lib/auth/roles'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

type Lane = {
  id: string
  labelAr: string
  ok: boolean
  needsOnce: boolean
  statusAr: string
  detailAr?: string
}

type Readiness = {
  ready: boolean
  messageAr: string
  lanes: Lane[]
  googleEmail: string | null
  imapConfigured: boolean
  autoSyncHintAr: string
  isOwner?: boolean
}

const DEFAULT_EMAIL = 'info@alhuda-alhikma.sa'

/**
 * Status-only workspace wiring — no connect grids.
 * One-shot IMAP password / Google OAuth only when still missing.
 */
export function WorkspaceAutoStatus({
  isOwner,
  onOpenCalendar,
}: {
  isOwner: boolean
  onOpenCalendar?: () => void
}) {
  const [data, setData] = useState<Readiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const [email, setEmail] = useState(DEFAULT_EMAIL)
  const [password, setPassword] = useState('')
  const [host, setHost] = useState('mail.alhuda-alhikma.sa')
  const [savingMail, setSavingMail] = useState(false)
  const [linkingGoogle, setLinkingGoogle] = useState(false)
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const botBase =
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || 'https://t.me/alhuda14bot'
  const telegramDeepLink = `${botBase.replace(/\/$/, '')}?start=scope_${encodeURIComponent(scopeId)}`

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/integrations/auto-sync', { headers })
      const json = (await res.json()) as Readiness & { error?: string }
      if (!res.ok) throw new Error(json.error || 'تعذّر فحص الحالة')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Quiet background sync when owner — no button required.
  useEffect(() => {
    if (!isOwner || !data?.ready) return
    let cancelled = false
    void (async () => {
      try {
        const headers = await authHeaders()
        await fetch('/api/integrations/auto-sync', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: '{}',
        })
        if (!cancelled) setOkMsg('تمت مزامنة الخلفية تلقائياً')
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOwner, data?.ready])

  async function saveImapOnce() {
    if (!isOwner) return
    setSavingMail(true)
    setError('')
    setOkMsg('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/mail/settings', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailAddress: email.trim() || DEFAULT_EMAIL,
          username: email.trim() || DEFAULT_EMAIL,
          password,
          imapHost: host.trim(),
          smtpHost: host.trim(),
          imapPort: 993,
          smtpPort: 465,
          imapSecure: true,
          smtpSecure: true,
          notifyTelegram: true,
          test: true,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'فشل حفظ البريد')
      setPassword('')
      setOkMsg(json.messageAr || 'تم ربط البريد — المزامنة تلقائية بعدها')
      await load()
      // Kick auto-sync immediately
      await fetch('/api/integrations/auto-sync', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(() => undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل')
    } finally {
      setSavingMail(false)
    }
  }

  async function oneTimeGoogle() {
    if (!isOwner) return
    setLinkingGoogle(true)
    setError('')
    try {
      await connectGoogleCalendar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر فتح Google')
      setLinkingGoogle(false)
    }
  }

  async function forceSync() {
    if (!isOwner) return
    setSyncing(true)
    setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/integrations/auto-sync', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'فشل')
      setOkMsg(json.messageAr || 'تمت المزامنة')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل')
    } finally {
      setSyncing(false)
    }
  }

  const mailLane = data?.lanes.find((l) => l.id === 'mail')
  const googleLane = data?.lanes.find((l) => l.id === 'google')
  const telegramLane = data?.lanes.find((l) => l.id === 'telegram')
  const showImapForm = isOwner && mailLane && !mailLane.ok
  const showGoogleOnce = isOwner && googleLane && !googleLane.ok
  const showTelegramOnce =
    isOwner && telegramLane && telegramLane.needsOnce && !telegramLane.ok

  return (
    <div className="space-y-4" dir="rtl">
      <div
        className={`rounded-xl border p-4 ${
          data?.ready
            ? 'border-emerald-200 bg-emerald-50/80'
            : 'border-ab-border bg-ab-surface'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-ab-ink">
              {data?.ready ? (
                <CheckCircle2
                  className="h-5 w-5 text-emerald-600"
                  aria-hidden
                />
              ) : null}
              {data?.ready ? 'مساحتك جاهزة' : 'ربط تلقائي'}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              {loading
                ? 'جاري فحص الخدمات…'
                : data?.messageAr || 'جاري التحميل…'}
            </p>
            <p className="mt-1 text-[11px] text-stone-500">
              {data?.autoSyncHintAr ||
                'لا خيارات ربط يدوية — النظام يربط من الإعدادات المخزّنة.'}
            </p>
          </div>
          {isOwner && (
            <button
              type="button"
              disabled={syncing || loading}
              onClick={() => void forceSync()}
              className="inline-flex items-center gap-1.5 rounded-md border border-ab-border bg-white px-2.5 py-1 text-[11px] text-stone-600 disabled:opacity-50"
              title="اختياري — المزامنة تعمل وحدها"
            >
              {syncing ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3 w-3" aria-hidden />
              )}
              حدّث الحالة
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      {okMsg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {okMsg}
        </p>
      )}

      <ul className="space-y-2">
        {(data?.lanes || []).map((lane) => (
          <li
            key={lane.id}
            className="rounded-xl border border-ab-border bg-ab-surface px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ab-ink">{lane.labelAr}</p>
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                  lane.ok
                    ? 'bg-emerald-50 text-emerald-800'
                    : lane.needsOnce
                      ? 'bg-amber-50 text-amber-900'
                      : 'bg-stone-100 text-stone-600'
                }`}
              >
                {lane.ok ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" aria-hidden />
                    مربوط
                  </>
                ) : lane.needsOnce ? (
                  'يحتاج إعداد مرة واحدة'
                ) : (
                  lane.statusAr
                )}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-stone-500">
              {lane.detailAr || lane.statusAr}
            </p>
            {lane.ok && lane.statusAr !== 'مربوط' ? (
              <p className="mt-0.5 text-[11px] text-emerald-700/90">
                {lane.statusAr}
              </p>
            ) : null}
          </li>
        ))}
        {loading && !data && (
          <li className="rounded-xl border border-dashed border-ab-border px-4 py-6 text-center text-xs text-stone-500">
            <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
            جاري قراءة حالة الربط التلقائي…
          </li>
        )}
      </ul>

      {showTelegramOnce && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-xs text-stone-600">
          <p className="font-semibold text-ab-ink">تيليجرام — ضغطة واحدة</p>
          <p className="mt-1">
            البوت جاهز على الاستضافة. افتح الرابط مرة واحدة لربط محادثتك — بعدها
            التنبيهات والمرايا تعمل تلقائياً.
          </p>
          <a
            href={telegramDeepLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex rounded-md bg-ab-accent px-3 py-1.5 text-[11px] font-semibold text-white"
          >
            فتح تيليجرام وربط المساحة
          </a>
        </div>
      )}

      {showImapForm && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ab-ink">
            <Mail className="h-4 w-4 text-ab-accent" aria-hidden />
            بريد الجمعية — مرة واحدة فقط
          </h4>
          <p className="mb-3 text-[12px] text-stone-600">
            أدخل كلمة مرور تطبيق لـ {DEFAULT_EMAIL}. بعدها المزامنة والتنبيهات
            تعمل وحدها — بلا أزرار ربط.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs sm:col-span-2">
              <span className="text-stone-500">البريد</span>
              <input
                dir="ltr"
                className="mt-1 w-full rounded-lg border border-ab-border bg-white px-2 py-1.5 font-mono text-sm"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  const d = e.target.value.split('@')[1]
                  if (d) setHost(`mail.${d}`)
                }}
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="text-stone-500">كلمة مرور التطبيق</span>
              <input
                dir="ltr"
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-ab-border bg-white px-2 py-1.5 font-mono text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="text-stone-500">مضيف البريد (IMAP/SMTP)</span>
              <input
                dir="ltr"
                className="mt-1 w-full rounded-lg border border-ab-border bg-white px-2 py-1.5 font-mono text-sm"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={savingMail || !password.trim()}
            onClick={() => void saveImapOnce()}
            className="mt-3 rounded-lg bg-ab-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {savingMail ? 'جاري الحفظ والاختبار…' : 'احفظ — ثم يعمل تلقائياً'}
          </button>
        </div>
      )}

      {showGoogleOnce && (
        <div className="rounded-xl border border-dashed border-ab-border bg-stone-50 p-4 text-xs text-stone-600">
          <p className="font-semibold text-ab-ink">اربط Google — مرة واحدة</p>
          <p className="mt-1">
            Gmail الشخصي والتقويم وDrive وSheets من تيليجرام تحتاج موافقة OAuth من
            المتصفح. بريد الجمعية (IMAP) يعمل بدونه. إن سبق الربط لـ{' '}
            {DEFAULT_DIRECTOR_EMAIL} يُستخدم تلقائياً.
          </p>
          <button
            type="button"
            disabled={linkingGoogle}
            onClick={() => void oneTimeGoogle()}
            className="mt-2 rounded-md bg-ab-ink px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {linkingGoogle ? 'جاري الفتح…' : 'اربط Google'}
          </button>
        </div>
      )}

      {isOwner && !showGoogleOnce && (
        <div className="rounded-xl border border-ab-border bg-ab-surface p-4 text-xs text-stone-600">
          <p className="font-semibold text-ab-ink">Google مربوط</p>
          <p className="mt-1">
            {data?.googleEmail
              ? `الحساب: ${data.googleEmail} — إعادة الربط إن انتهت الصلاحيات أو أضفت نطاقاً جديداً.`
              : 'التوكن محفوظ. أعد الربط فقط إن فشل Drive/Gmail أو طُلبت صلاحيات جديدة.'}
          </p>
          <button
            type="button"
            disabled={linkingGoogle}
            onClick={() => void oneTimeGoogle()}
            className="mt-2 rounded-md border border-ab-border bg-white px-3 py-1.5 text-[11px] font-semibold text-ab-ink disabled:opacity-50"
          >
            {linkingGoogle ? 'جاري الفتح…' : 'أعد ربط Google'}
          </button>
        </div>
      )}

      {!isOwner && (
        <p className="rounded-xl border border-ab-border bg-ab-surface px-4 py-3 text-xs text-stone-600">
          الإعدادات التقنية للمالك فقط. عملك اليومي من الغرف والتقويم والمساعدين
          — نفس السياق يتزامن تلقائياً.
          {onOpenCalendar ? (
            <button
              type="button"
              onClick={onOpenCalendar}
              className="mt-2 block rounded-md bg-ab-ink px-3 py-1.5 text-[11px] font-semibold text-white"
            >
              فتح التقويم
            </button>
          ) : null}
        </p>
      )}
    </div>
  )
}
