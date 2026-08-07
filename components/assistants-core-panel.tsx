'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Send,
  Loader2,
  Link2,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  Clock,
  ListTodo,
  X,
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
  AssistantJob,
} from '@/lib/assistants/types'

const LS_KEY = 'ab-assistant-queue-v1'

type CatalogResponse = {
  titleAr?: string
  subtitleAr?: string
  howToAr?: string
  hintAr?: string
  parallelNoteAr?: string
  maxParallel?: number
  telegramHintAr?: string
  assistants?: AssistantCatalogItem[]
}

type QueueListResponse = {
  ok?: boolean
  jobs?: AssistantJob[]
  maxParallel?: number
  hintAr?: string
  counts?: {
    waiting: number
    running: number
    done: number
    failed: number
  }
}

function formatDurationAr(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} ث`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} د ${s} ث` : `${m} د`
}

function formatEtaAr(seconds: number, elapsedMs?: number | null): string {
  if (elapsedMs != null && elapsedMs > 0) {
    const left = Math.max(5, seconds - Math.round(elapsedMs / 1000))
    return `≈ ${left} ث متبقية`
  }
  return `≈ ${seconds} ث`
}

function loadLocalQueue(scopeId: string): AssistantJob[] {
  try {
    const raw = localStorage.getItem(`${LS_KEY}:${scopeId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AssistantJob[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveLocalQueue(scopeId: string, jobs: AssistantJob[]) {
  try {
    localStorage.setItem(
      `${LS_KEY}:${scopeId}`,
      JSON.stringify(jobs.slice(-80))
    )
  } catch {
    /* ignore */
  }
}

function mergeJobs(prev: AssistantJob[], incoming: AssistantJob[]): AssistantJob[] {
  const map = new Map<string, AssistantJob>()
  for (const j of prev) map.set(j.id, j)
  for (const j of incoming) map.set(j.id, j)
  return [...map.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  )
}

export function AssistantsCorePanel({
  onNavigate,
  initialAssistantId,
}: {
  onNavigate?: (section: string) => void
  initialAssistantId?: string | null
}) {
  const signedIn = useSignedIn()
  const scopeId = useWorkspaceStore((s) => s.activeScopeId) || 'shared-demo'
  const canAccessOpsUi = useWorkspaceModeStore((s) => s.canAccessOpsUi)
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [imapConnected, setImapConnected] = useState<boolean | null>(null)
  const [cuaStatusAr, setCuaStatusAr] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [connectingGoogle, setConnectingGoogle] = useState(false)
  const [error, setError] = useState('')
  const [jobs, setJobs] = useState<AssistantJob[]>([])
  const [maxParallel, setMaxParallel] = useState(8)
  const [hintAr, setHintAr] = useState(
    'حتى 8 وكيل/مهمة معاً؛ الباقي بالانتظار.'
  )
  const [enqueueBusy, setEnqueueBusy] = useState(false)
  const [barOpen, setBarOpen] = useState(true)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const inFlight = useRef(new Set<string>())
  const drainLock = useRef(false)

  // Catalog + optional focus → seed composer (no card grid)
  useEffect(() => {
    void fetch('/api/assistants')
      .then((r) => r.json())
      .then((d: CatalogResponse) => {
        setCatalog(d)
        if (typeof d.maxParallel === 'number') setMaxParallel(d.maxParallel)
        if (d.hintAr) setHintAr(d.hintAr)
        try {
          const focus =
            initialAssistantId ||
            sessionStorage.getItem('ab-assistant-focus')
          if (focus) sessionStorage.removeItem('ab-assistant-focus')
          const a = d.assistants?.find((x) => x.id === focus)
          if (a?.starterPromptAr) setMessage(a.starterPromptAr)
        } catch {
          /* ignore */
        }
      })
      .catch(() => setCatalog({ assistants: [] }))
  }, [initialAssistantId])

  useEffect(() => {
    setJobs(loadLocalQueue(scopeId))
  }, [scopeId])

  useEffect(() => {
    saveLocalQueue(scopeId, jobs)
  }, [jobs, scopeId])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (signedIn !== true) {
      setGoogleConnected(null)
      setImapConnected(null)
      setCuaStatusAr(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const headers = await authHeaders()
        const [g, i, m] = await Promise.all([
          fetch('/api/google/calendar?action=status', { headers }),
          fetch('/api/integrations/status'),
          fetch('/api/mail/settings', { headers }),
        ])
        const gj = (await g.json()) as { connected?: boolean }
        const ij = (await i.json()) as {
          cuaStatusAr?: string
          cuaBridgeOnline?: boolean
        }
        const mj = (await m.json()) as { configured?: boolean }
        if (cancelled) return
        setGoogleConnected(Boolean(gj.connected))
        setImapConnected(Boolean(mj.configured))
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
          setImapConnected(false)
          setCuaStatusAr('غير متصل')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn])

  const refreshQueue = useCallback(async () => {
    if (signedIn !== true) return
    try {
      const headers = await authHeaders()
      const res = await fetch(
        `/api/assistants/queue?scopeId=${encodeURIComponent(scopeId)}`,
        { headers }
      )
      const data = (await res.json()) as QueueListResponse
      if (!res.ok || !data.jobs) return
      if (typeof data.maxParallel === 'number') setMaxParallel(data.maxParallel)
      if (data.hintAr) setHintAr(data.hintAr)
      setJobs((prev) => mergeJobs(prev, data.jobs || []))
    } catch {
      /* local cache still shown */
    }
  }, [scopeId, signedIn])

  useEffect(() => {
    void refreshQueue()
    const id = window.setInterval(() => void refreshQueue(), 8000)
    return () => window.clearInterval(id)
  }, [refreshQueue])

  const processJob = useCallback(
    async (jobId: string) => {
      if (inFlight.current.has(jobId)) return
      inFlight.current.add(jobId)
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.status === 'waiting'
            ? {
                ...j,
                status: 'running',
                startedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : j
        )
      )
      try {
        const headers = {
          ...(await authHeaders()),
          'Content-Type': 'application/json',
        }
        const res = await fetch('/api/assistants/queue/process', {
          method: 'POST',
          headers,
          body: JSON.stringify({ jobId, scopeId }),
        })
        const data = (await res.json()) as {
          job?: AssistantJob
          hasPendingApprovals?: boolean
          atCapacity?: boolean
          maxParallel?: number
          hintAr?: string
          blocked?: { messageAr: string }
          error?: string
        }
        if (typeof data.maxParallel === 'number') setMaxParallel(data.maxParallel)
        if (data.hintAr) setHintAr(data.hintAr)
        if (data.job) {
          setJobs((prev) => mergeJobs(prev, [data.job!]))
          setSelectedJobId(data.job.id)
          if (data.hasPendingApprovals) {
            window.dispatchEvent(new Event('ab-approvals-changed'))
          }
        } else if (data.atCapacity) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === jobId && j.status === 'running'
                ? { ...j, status: 'waiting', startedAt: null }
                : j
            )
          )
        } else if (!res.ok) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === jobId
                ? {
                    ...j,
                    status: 'failed',
                    errorAr:
                      data.blocked?.messageAr ||
                      data.error ||
                      'تعذّر التنفيذ',
                    finishedAt: new Date().toISOString(),
                  }
                : j
            )
          )
        }
      } catch {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  status: 'failed',
                  errorAr: 'تعذّر الاتصال بالخادم.',
                  finishedAt: new Date().toISOString(),
                }
              : j
          )
        )
      } finally {
        inFlight.current.delete(jobId)
      }
    },
    [scopeId]
  )

  const drainQueue = useCallback(async () => {
    if (signedIn !== true || drainLock.current) return
    drainLock.current = true
    try {
      const waiting = jobs.filter(
        (j) => j.status === 'waiting' && !inFlight.current.has(j.id)
      )
      const activeIds = new Set<string>([
        ...jobs.filter((j) => j.status === 'running').map((j) => j.id),
        ...inFlight.current,
      ])
      const slots = Math.max(0, maxParallel - activeIds.size)
      const batch = waiting.slice(0, slots)
      for (const j of batch) {
        void processJob(j.id)
      }
    } finally {
      drainLock.current = false
    }
  }, [jobs, maxParallel, processJob, signedIn])

  useEffect(() => {
    void drainQueue()
  }, [drainQueue])

  async function linkGoogle() {
    setConnectingGoogle(true)
    setError('')
    try {
      await connectGoogleCalendar()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'تعذّر بدء ربط Google — حاول من الإعدادات'
      )
      setConnectingGoogle(false)
    }
  }

  async function enqueue() {
    setError('')
    if (signedIn !== true) {
      setError('سجّل الدخول لإرسال المهام.')
      return
    }
    const text = message.trim()
    if (!text) {
      setError('اكتب ما تريده في خانة الطلب.')
      return
    }
    setEnqueueBusy(true)
    try {
      const headers = {
        ...(await authHeaders()),
        'Content-Type': 'application/json',
      }
      const res = await fetch('/api/assistants/queue', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: text, scopeId }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        job?: AssistantJob
        maxParallel?: number
        hintAr?: string
        error?: string
      }
      if (!res.ok || !data.job) {
        setError(data.error || 'تعذّر إضافة المهمة')
        return
      }
      if (typeof data.maxParallel === 'number') setMaxParallel(data.maxParallel)
      if (data.hintAr) setHintAr(data.hintAr)
      setJobs((prev) => mergeJobs(prev, [data.job!]))
      setSelectedJobId(data.job.id)
      setMessage('')
      setBarOpen(true)
    } catch {
      setError('تعذّر الاتصال بالخادم.')
    } finally {
      setEnqueueBusy(false)
    }
  }

  const running = jobs.filter((j) => j.status === 'running')
  const waiting = jobs.filter((j) => j.status === 'waiting')
  const done = jobs
    .filter((j) => j.status === 'done' || j.status === 'failed')
    .slice()
    .reverse()
  const selected =
    jobs.find((j) => j.id === selectedJobId) ||
    running[0] ||
    done[0] ||
    null

  void tick // keep ETA clocks live

  return (
    <section
      className="ab-page-narrow relative pb-36"
      dir="rtl"
    >
      <div>
        <h2 className="ab-title">
          {catalog?.titleAr || 'مهام التشغيل'}
        </h2>
        <p className="ab-subtitle">
          {catalog?.subtitleAr ||
            'مهام تشغيل عامة للمساحة (بريد/تقويم) — غرفة الفريق للمحادثة والوكلاء بـ @.'}
        </p>
        <p className="mt-2 text-[12px] font-medium text-ab-accent">
          {hintAr}
        </p>
        {canAccessOpsUi && cuaStatusAr !== null ? (
          <p className="mt-2 text-[12px] text-ab-muted">
            جسر Cua:{' '}
            <span
              className={
                cuaStatusAr === 'متصل' ? 'text-emerald-700' : 'text-ab-muted-soft'
              }
            >
              {cuaStatusAr}
            </span>
          </p>
        ) : null}
      </div>

      {signedIn !== true && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          سجّل الدخول لإرسال المهام وحفظ الطابور ضمن غرفتك.
        </div>
      )}

      {signedIn === true &&
        imapConnected === false &&
        googleConnected === false && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-amber-950">
                البريد غير مربوط — اضبط IMAP لـ info@alhuda-alhikma.sa من «بريد
                الجمعية» (موصى به)، أو اربط Google إن توفر Workspace.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate?.('mail')}
                  className="ab-btn-primary"
                >
                  بريد الجمعية (IMAP)
                </button>
                <button
                  type="button"
                  disabled={connectingGoogle}
                  onClick={() => void linkGoogle()}
                  className="ab-btn-secondary"
                >
                  {connectingGoogle ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Google اختياري
                </button>
              </div>
            </div>
          </div>
        )}

      {signedIn === true && imapConnected === true && (
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          بريد IMAP مربوط — الوارد والردود جاهزة
        </p>
      )}

      {signedIn === true &&
        imapConnected === false &&
        googleConnected === true && (
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Google مربوط — يُفضّل أيضاً IMAP لبريد الجمعية
          </p>
        )}

      {/* Single composer */}
      <div className="ab-composer">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-ab-ink">
            ماذا تريد تنفيذه؟
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            dir="rtl"
            placeholder="مثال: فرّز بريدي اليوم… أو ملخص مواعيدي… أو حوّل الملف إلى PDF"
            className="ab-input resize-y !py-3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void enqueue()
              }
            }}
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={enqueueBusy || signedIn !== true}
            onClick={() => void enqueue()}
            className="ab-btn-primary px-5 py-2.5 text-sm"
          >
            {enqueueBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                جاري الإضافة…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden />
                إرسال
              </>
            )}
          </button>
          <span className="text-[11px] text-ab-muted">
            ⌘/Ctrl + Enter للإرسال السريع
          </span>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {/* Selected / latest result */}
      {selected && (selected.resultText || selected.errorAr || selected.status === 'running') ? (
        <div
          className={cn(
            'rounded-xl border p-4',
            selected.status === 'failed'
              ? 'border-red-200 bg-red-50/40'
              : selected.status === 'running'
                ? 'border-ab-accent/30 bg-ab-accent/5'
                : 'border-emerald-200/80 bg-emerald-50/40'
          )}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-stone-700">
              {selected.assistantNameAr}
              {selected.status === 'running'
                ? ' — جاري التنفيذ…'
                : selected.status === 'failed'
                  ? ' — فشلت'
                  : ' — انتهت'}
              {selected.durationMs != null
                ? ` · ${formatDurationAr(selected.durationMs)}`
                : null}
            </p>
            {selected.pendingApprovalIds?.length ? (
              <button
                type="button"
                onClick={() => onNavigate?.('approvals')}
                className="rounded-lg border border-ab-warn/40 bg-ab-warn/10 px-2.5 py-1 text-[11px] font-semibold text-ab-warn"
              >
                موافقة معلّقة
              </button>
            ) : null}
          </div>
          {selected.errorAr ? (
            <p className="text-sm text-red-800">{selected.errorAr}</p>
          ) : null}
          {selected.usedTools && selected.usedTools.length > 0 ? (
            <ul className="mb-3 space-y-1">
              {selected.usedTools.map((t, i) => (
                <li
                  key={`${t.name}-${i}`}
                  className="text-[12px] text-stone-700"
                >
                  <span className="font-semibold text-ab-ink">{t.labelAr}</span>{' '}
                  <span className="text-stone-600">{t.summaryAr}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {selected.resultText ? (
            <div
              className="whitespace-pre-wrap text-sm leading-relaxed text-ab-ink"
              dir="rtl"
            >
              {selected.resultText}
            </div>
          ) : selected.status === 'running' ? (
            <p className="flex items-center gap-2 text-sm text-stone-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {formatEtaAr(
                selected.etaSeconds,
                selected.startedAt
                  ? Date.now() - Date.parse(selected.startedAt)
                  : null
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Bottom sticky queue bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ab-border bg-white/95 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md md:ms-[15.5rem]">
        <div className="mx-auto max-w-3xl px-4 py-2" dir="rtl">
          <button
            type="button"
            onClick={() => setBarOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 py-1 text-start"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px]">
              <ListTodo className="h-4 w-4 shrink-0 text-ab-accent" aria-hidden />
              <span className="font-bold text-ab-ink">طابور المهام</span>
              <span className="rounded-md bg-ab-accent/10 px-1.5 py-0.5 font-semibold text-ab-accent">
                نشط {running.length}
              </span>
              <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-stone-700">
                انتظار {waiting.length}
              </span>
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                منجز {done.filter((j) => j.status === 'done').length}
              </span>
              <span className="hidden text-stone-500 sm:inline">{hintAr}</span>
            </div>
            {barOpen ? (
              <ChevronDown className="h-4 w-4 text-stone-500" aria-hidden />
            ) : (
              <ChevronUp className="h-4 w-4 text-stone-500" aria-hidden />
            )}
          </button>

          {barOpen ? (
            <div className="max-h-[40vh] space-y-2 overflow-y-auto pb-2 pt-1">
              {running.length === 0 &&
              waiting.length === 0 &&
              done.length === 0 ? (
                <p className="ab-empty !py-3 text-[12px] !text-ab-muted">
                  لا مهام بعد — اكتب طلبك أعلاه ثم اضغط إرسال.
                </p>
              ) : null}

              {running.map((j) => {
                const elapsed = j.startedAt
                  ? Date.now() - Date.parse(j.startedAt)
                  : 0
                return (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setSelectedJobId(j.id)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-start',
                      selectedJobId === j.id
                        ? 'border-ab-accent bg-ab-accent/5'
                        : 'border-ab-border bg-white'
                    )}
                  >
                    <Loader2
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-ab-accent"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-ab-ink">
                        {j.message}
                      </p>
                      <p className="mt-0.5 text-[11px] text-stone-500">
                        {j.assistantNameAr} · نشط ·{' '}
                        {formatEtaAr(j.etaSeconds, elapsed)} · مضى{' '}
                        {formatDurationAr(elapsed)}
                      </p>
                    </div>
                  </button>
                )
              })}

              {waiting.map((j, idx) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setSelectedJobId(j.id)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-start',
                    selectedJobId === j.id
                      ? 'border-ab-accent bg-ab-accent/5'
                      : 'border-stone-200 bg-stone-50'
                  )}
                >
                  <Clock
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-ab-ink">
                      {j.message}
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-500">
                      {j.assistantNameAr} · بالانتظار (#{idx + 1}) · تقدير{' '}
                      {formatEtaAr(j.etaSeconds)}
                    </p>
                  </div>
                </button>
              ))}

              {done.length > 0 ? (
                <div className="border-t border-stone-100 pt-2">
                  <p className="mb-1 text-[11px] font-bold text-stone-600">
                    منجَز سابقاً
                  </p>
                  {done.slice(0, 8).map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => setSelectedJobId(j.id)}
                      className={cn(
                        'mb-1 flex w-full items-start gap-2 rounded-lg border px-3 py-1.5 text-start',
                        selectedJobId === j.id
                          ? 'border-ab-accent bg-ab-accent/5'
                          : 'border-transparent hover:bg-stone-50'
                      )}
                    >
                      {j.status === 'failed' ? (
                        <X
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500"
                          aria-hidden
                        />
                      ) : (
                        <CheckCircle2
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] text-ab-ink">
                          {j.message}
                        </p>
                        <p className="text-[10px] text-stone-500">
                          {j.assistantNameAr} · {formatDurationAr(j.durationMs)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
