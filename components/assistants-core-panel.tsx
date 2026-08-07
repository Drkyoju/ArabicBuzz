'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Inbox,
  CalendarDays,
  FolderSearch,
  FilePenLine,
  Send,
  Sparkles,
  Loader2,
  ShieldAlert,
  Link2,
  Compass,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import {
  authHeaders,
  connectGoogleCalendar,
} from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { useWorkspaceModeStore } from '@/lib/scopes/workspace-mode-store'
import { cn } from '@/lib/utils'
import type {
  AssistantCatalogItem,
  AssistantId,
  AssistantUsedTool,
} from '@/lib/assistants/types'

const ICONS: Record<AssistantId, LucideIcon> = {
  'day-captain': Compass,
  'inbox-zero': Inbox,
  'daily-brief': CalendarDays,
  'file-search': FolderSearch,
  'file-office': FilePenLine,
  'telegram-captain': Send,
  general: Sparkles,
}

type CatalogResponse = {
  titleAr?: string
  subtitleAr?: string
  telegramHintAr?: string
  assistants?: AssistantCatalogItem[]
}

type RunOk = {
  ok: true
  text: string
  nameAr: string
  assistantId: string
  pendingApprovalIds?: string[]
  hasPendingApprovals?: boolean
  steps?: number
  toolNames?: string[]
  usedTools?: AssistantUsedTool[]
}

type RunBlocked = {
  ok: false
  blocked: { reason: string; messageAr: string }
  nameAr?: string
}

export function AssistantsCorePanel({
  onNavigate,
  initialAssistantId,
}: {
  onNavigate?: (section: string) => void
  initialAssistantId?: string | null
}) {
  const signedIn = useSignedIn()
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const canAccessOpsUi = useWorkspaceModeStore((s) => s.canAccessOpsUi)
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [telegramReady, setTelegramReady] = useState<boolean | null>(null)
  const [cuaStatusAr, setCuaStatusAr] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<AssistantId | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [connectingGoogle, setConnectingGoogle] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<RunOk | null>(null)

  useEffect(() => {
    void fetch('/api/assistants')
      .then((r) => r.json())
      .then((d: CatalogResponse) => {
        setCatalog(d)
        const preferred =
          (initialAssistantId &&
            d.assistants?.find((a) => a.id === initialAssistantId)) ||
          null
        const focus =
          preferred ||
          (() => {
            try {
              const raw = sessionStorage.getItem('ab-assistant-focus')
              if (raw) {
                sessionStorage.removeItem('ab-assistant-focus')
                return d.assistants?.find((a) => a.id === raw) || null
              }
            } catch {
              /* ignore */
            }
            return null
          })()
        const first = focus || d.assistants?.[0]
        if (first) {
          setSelectedId(first.id)
          setMessage(first.starterPromptAr)
        }
      })
      .catch(() => setCatalog({ assistants: [] }))
  }, [initialAssistantId])

  useEffect(() => {
    if (signedIn !== true) {
      setGoogleConnected(null)
      setTelegramReady(null)
      setCuaStatusAr(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const headers = await authHeaders()
        const [g, i] = await Promise.all([
          fetch('/api/google/calendar?action=status', { headers }),
          fetch('/api/integrations/status'),
        ])
        const gj = (await g.json()) as { connected?: boolean }
        const ij = (await i.json()) as {
          telegramConfigured?: boolean
          telegramOutboundReady?: boolean
          cuaStatusAr?: string
          cuaBridgeOnline?: boolean
          cuaBridgeConfigured?: boolean
        }
        if (cancelled) return
        setGoogleConnected(Boolean(gj.connected))
        setTelegramReady(
          Boolean(ij.telegramConfigured || ij.telegramOutboundReady)
        )
        setCuaStatusAr(
          typeof ij.cuaStatusAr === 'string'
            ? ij.cuaStatusAr
            : ij.cuaBridgeOnline
              ? 'متصل'
              : 'غير متصل'
        )
      } catch {
        if (!cancelled) {
          setGoogleConnected(false)
          setTelegramReady(false)
          setCuaStatusAr('غير متصل')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn])

  const assistants = catalog?.assistants || []
  const selected = assistants.find((a) => a.id === selectedId) || null
  const needsGoogle =
    selected?.requires === 'google' && googleConnected === false

  const selectAssistant = useCallback((a: AssistantCatalogItem) => {
    setSelectedId(a.id)
    setMessage(a.starterPromptAr)
    setResult(null)
    setError('')
  }, [])

  const requirementBlocked = (a: AssistantCatalogItem | null): string | null => {
    if (!a) return null
    if (a.requires === 'google' && googleConnected === false) {
      return a.emptyStateAr || 'يلزم ربط Google أولاً.'
    }
    if (a.requires === 'telegram' && telegramReady === false) {
      return a.emptyStateAr || null
    }
    return null
  }

  async function linkGoogle() {
    setConnectingGoogle(true)
    setError('')
    try {
      await connectGoogleCalendar()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'تعذّر بدء ربط Google — حاول من الإعدادات'
      )
      setConnectingGoogle(false)
    }
  }

  async function run() {
    setError('')
    setResult(null)
    if (signedIn !== true) {
      setError('سجّل الدخول لتشغيل المساعدين.')
      return
    }
    if (!selectedId || !message.trim()) {
      setError('اختر مساعداً واكتب النتيجة المطلوبة.')
      return
    }
    if (selected?.requires === 'google' && needsGoogle) {
      setError(
        selected.emptyStateAr ||
          'اربط Google أولاً — لن يعمل المساعد بدون Gmail/تقويم.'
      )
      return
    }
    setBusy(true)
    try {
      const headers = {
        ...(await authHeaders()),
        'Content-Type': 'application/json',
      }
      const res = await fetch('/api/assistants/run', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          assistantId: selectedId,
          message: message.trim(),
          scopeId: scopeId || 'shared-demo',
        }),
      })
      const data = (await res.json()) as RunOk | RunBlocked | { error?: string }
      if (!res.ok) {
        if ('blocked' in data && data.blocked) {
          setError(data.blocked.messageAr)
        } else {
          setError(
            ('error' in data && data.error) || 'تعذّر تشغيل المساعد'
          )
        }
        return
      }
      if ('ok' in data && data.ok) {
        setResult(data)
        if (data.hasPendingApprovals) {
          window.dispatchEvent(new Event('ab-approvals-changed'))
        }
      }
    } catch {
      setError('تعذّر الاتصال بالخادم.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-5 px-6 py-8" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-ab-ink">
          {catalog?.titleAr || 'مساعد العمل — بريد · تقويم · تيليجرام'}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-500">
          {catalog?.subtitleAr ||
            'مساعدون تنفيذيون يستدعون الأدوات ويعيدون أفعالاً ملموسة — ليست دردشة فارغة.'}
        </p>
        {canAccessOpsUi && catalog?.telegramHintAr ? (
          <p className="mt-2 text-[12px] text-stone-500">
            {catalog.telegramHintAr}
          </p>
        ) : null}
        {canAccessOpsUi && cuaStatusAr !== null ? (
          <p className="mt-2 text-[12px] text-stone-600">
            جسر Cua:{' '}
            <span
              className={
                cuaStatusAr === 'متصل' ? 'text-emerald-700' : 'text-stone-500'
              }
            >
              {cuaStatusAr}
            </span>
            {cuaStatusAr !== 'متصل' ? (
              <span className="text-stone-500">
                {' '}
                — ثبّت Cua على جهازك ثم اربط العنوان من الإعدادات
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {signedIn !== true && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          سجّل الدخول لتشغيل المساعدين وحفظ النتائج ضمن غرفتك.
        </div>
      )}

      {signedIn === true && googleConnected === false && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-950">
                Google غير مربوط — المساعدون الذين يعتمدون على البريد والتقويم
                لن يعملوا
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-amber-900/90">
                اربط حسابك لتشغيل «كابتن اليوم» و«صفر البريد» وقراءة Gmail
                وتقويم Google. (تقويم الغرفة الداخلي يعمل بدون Google.)
              </p>
            </div>
            <button
              type="button"
              disabled={connectingGoogle}
              onClick={() => void linkGoogle()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {connectingGoogle ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  جاري التوجيه…
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" aria-hidden />
                  اربط Google الآن
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {signedIn === true && googleConnected === true && (
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Google مربوط — البريد والتقويم جاهزان للمساعدين
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {assistants.map((a) => {
          const Icon = ICONS[a.id] || Sparkles
          const active = a.id === selectedId
          const warn =
            (a.requires === 'google' && googleConnected === false) ||
            (a.requires === 'telegram' && telegramReady === false)
          const featured = a.id === 'day-captain'
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => selectAssistant(a)}
              className={cn(
                'rounded-xl border p-4 text-right transition',
                active
                  ? 'border-ab-accent bg-ab-accent/5 shadow-sm'
                  : featured
                    ? 'border-ab-accent/50 bg-ab-accent/[0.03] hover:border-ab-accent'
                    : 'border-ab-border bg-ab-surface hover:border-stone-300'
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    active
                      ? 'bg-ab-accent/15 text-ab-accent'
                      : featured
                        ? 'bg-ab-accent/10 text-ab-accent'
                        : 'bg-stone-100 text-stone-600'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ab-ink">
                    {a.nameAr}
                    {featured ? (
                      <span className="ms-1.5 text-[10px] font-semibold text-ab-accent">
                        موصى به
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    {a.taglineAr}
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-stone-600">
                    {a.descriptionAr}
                  </p>
                  {warn ? (
                    <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-amber-800">
                      <Link2 className="h-3 w-3" aria-hidden />
                      {a.requires === 'google'
                        ? 'يحتاج ربط Google'
                        : 'تيليجرام اختياري للإرسال'}
                    </p>
                  ) : null}
                  {canAccessOpsUi && a.ownerHintAr ? (
                    <p
                      dir="ltr"
                      className="mt-1.5 text-left font-mono text-[10px] text-stone-400"
                    >
                      {a.ownerHintAr}
                    </p>
                  ) : null}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="rounded-xl border border-ab-border bg-ab-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-ab-ink">
                تشغيل: {selected.nameAr}
              </p>
              <p className="text-[11px] text-stone-500">
                عدّل النتيجة إن لزم ثم اضغط «شغّل» — المساعد يستدعي الأدوات
                ويعيد ما نُفّذ.
              </p>
            </div>
          </div>

          {needsGoogle ? (
            <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-4">
              <div className="flex gap-2">
                <ShieldAlert
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-800"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-amber-950">
                    لا يمكن التشغيل بدون Google
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-amber-900">
                    {requirementBlocked(selected)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={connectingGoogle}
                      onClick={() => void linkGoogle()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {connectingGoogle ? (
                        <>
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden
                          />
                          جاري التوجيه…
                        </>
                      ) : (
                        <>
                          <Link2 className="h-4 w-4" aria-hidden />
                          اربط Google الآن
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate?.('settings')}
                      className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-[11px] font-semibold text-amber-950"
                    >
                      أو من الإعدادات
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {selected.requires === 'telegram' &&
            telegramReady === false &&
            selected.emptyStateAr ? (
            <div className="mb-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[12px] text-stone-700">
              {selected.emptyStateAr}
            </div>
          ) : null}

          <label className="block">
            <span className="sr-only">النتيجة المطلوبة</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={canAccessOpsUi ? 4 : 3}
              dir="rtl"
              disabled={Boolean(needsGoogle)}
              className="w-full resize-y rounded-lg border border-ab-border bg-white px-3 py-2 text-sm text-ab-ink outline-none focus:border-ab-accent disabled:bg-stone-50 disabled:text-stone-400"
              placeholder="صف النتيجة…"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || signedIn !== true || Boolean(needsGoogle)}
              onClick={() => void run()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ab-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  جاري التنفيذ…
                </>
              ) : (
                'شغّل'
              )}
            </button>
            {result?.hasPendingApprovals ? (
              <button
                type="button"
                onClick={() => onNavigate?.('approvals')}
                className="rounded-lg border border-ab-warn/40 bg-ab-warn/10 px-3 py-2 text-xs font-semibold text-ab-warn"
              >
                مراجعة موافقة معلّقة
              </button>
            ) : null}
          </div>

          {error ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          {result?.text || (result?.usedTools && result.usedTools.length > 0) ? (
            <div className="mt-4 space-y-3">
              {result.usedTools && result.usedTools.length > 0 ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3">
                  <p className="mb-2 text-[11px] font-bold text-stone-700">
                    ما نُفّذ عبر الأدوات
                    {result.steps ? ` · ${result.steps} خطوة` : ''}
                  </p>
                  <ul className="space-y-1.5">
                    {result.usedTools.map((t, i) => (
                      <li
                        key={`${t.name}-${i}`}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]"
                      >
                        <span className="font-semibold text-ab-ink">
                          {t.labelAr}
                        </span>
                        <span className="text-stone-600">{t.summaryAr}</span>
                        {canAccessOpsUi ? (
                          <span
                            dir="ltr"
                            className="font-mono text-[10px] text-stone-400"
                          >
                            {t.name}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : result.text ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-900">
                  لم يُسجَّل استدعاء أدوات في هذه الجولة — إن كانت النتيجة عامة
                  جداً، أعد التشغيل أو تحقق من ربط Google.
                </p>
              ) : null}

              {result.text ? (
                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4">
                  <p className="mb-2 text-[11px] font-semibold text-emerald-900">
                    نتيجة — {result.nameAr}
                  </p>
                  <div
                    className="whitespace-pre-wrap text-sm leading-relaxed text-ab-ink"
                    dir="rtl"
                  >
                    {result.text}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
