'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Maximize2,
  FileText,
  MessageCircle,
  Paperclip,
} from 'lucide-react'
import {
  authHeaders,
  connectGoogleCalendar,
} from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { useWorkspaceModeStore } from '@/lib/scopes/workspace-mode-store'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'
import { ModelPicker } from '@/components/model-picker'
import { EffortPicker } from '@/components/effort-picker'
import {
  RUN_EFFORT_LABELS_AR,
  parseRunEffort,
} from '@/lib/ai/run-effort'
import { HARNESS_MODEL_CATALOG } from '@/lib/ai/harness-catalog'
import { cn } from '@/lib/utils'
import type {
  AssistantCatalogItem,
  AssistantJob,
} from '@/lib/assistants/types'
import { TelegramMirrorChat } from '@/components/telegram-mirror-chat'
import { AssistantsOpsSeatsStrip } from '@/components/assistants-ops-seats'
import { ComposerMicButton } from '@/components/composer-mic-button'
import {
  AB_ATTACH_ASSISTANTS,
  AB_FILE_DND,
  composerHintForFile,
  dispatchAttachRoom,
  getBridgeDragData,
  parseFileMarkersFromText,
  sendWorkspaceFileToTelegram,
  setBridgeDragData,
  type BridgeFilePayload,
} from '@/lib/files/workspace-bridge'

const LS_KEY = 'ab-assistant-queue-v1'

type CatalogResponse = {
  titleAr?: string
  subtitleAr?: string
  howToAr?: string
  hintAr?: string
  parallelNoteAr?: string
  maxParallel?: number
  maxPerUser?: number
  telegramHintAr?: string
  assistants?: AssistantCatalogItem[]
}

type QueueListResponse = {
  ok?: boolean
  jobs?: AssistantJob[]
  maxParallel?: number
  maxPerUser?: number
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

function modelLabelAr(slug: string | null | undefined): string | null {
  if (!slug) return null
  const hit = HARNESS_MODEL_CATALOG.find((m) => m.slug === slug)
  return hit ? `${hit.labelEn}` : slug
}

function effortLabelAr(raw: string | null | undefined): string | null {
  if (!raw) return null
  return RUN_EFFORT_LABELS_AR[parseRunEffort(raw)]
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

function TaskPane({
  job,
  expanded,
  onToggle,
  onNavigate,
}: {
  job: AssistantJob
  expanded: boolean
  onToggle: () => void
  onNavigate?: (section: string) => void
}) {
  const elapsed =
    job.status === 'running' && job.startedAt
      ? Date.now() - Date.parse(job.startedAt)
      : null
  const model = modelLabelAr(job.modelSlug)
  const effort = effortLabelAr(job.effortLevel)
  const resultFiles = useMemo(
    () =>
      job.resultText
        ? parseFileMarkersFromText(job.resultText, job.scopeId)
        : [],
    [job.resultText, job.scopeId]
  )
  const [tgBusyId, setTgBusyId] = useState<string | null>(null)
  const [tgNote, setTgNote] = useState('')

  async function sendFileToTelegram(f: BridgeFilePayload) {
    setTgBusyId(f.fileId)
    setTgNote('')
    try {
      const sent = await sendWorkspaceFileToTelegram({
        ...f,
        kind: f.kind || 'edited',
        edited: true,
      })
      if (!sent.ok) throw new Error(sent.error || 'تعذّر الإرسال')
      setTgNote(`أُرسل «${f.name}» لتيليجرام`)
    } catch (e) {
      setTgNote(e instanceof Error ? e.message : 'خطأ')
    } finally {
      setTgBusyId(null)
    }
  }

  return (
    <article
      className={cn(
        'flex min-h-[9.5rem] flex-col rounded-xl border p-3 text-start shadow-sm transition-shadow',
        job.status === 'failed'
          ? 'border-red-200 bg-red-50/50'
          : job.status === 'running'
            ? 'border-ab-accent/35 bg-ab-accent/5'
            : job.status === 'waiting'
              ? 'border-stone-200 bg-stone-50/80'
              : 'border-emerald-200/80 bg-emerald-50/40'
      )}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold text-ab-ink">
            {job.assistantNameAr}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-stone-700">
            {job.message}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
            job.status === 'running'
              ? 'bg-ab-accent/15 text-ab-accent'
              : job.status === 'waiting'
                ? 'bg-stone-200/80 text-stone-700'
                : job.status === 'failed'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-emerald-100 text-emerald-800'
          )}
        >
          {job.status === 'running'
            ? 'نشط'
            : job.status === 'waiting'
              ? 'انتظار'
              : job.status === 'failed'
                ? 'فشل'
                : 'منجز'}
        </span>
      </div>

      <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-stone-500">
        {model ? <span dir="ltr">{model}</span> : null}
        {effort ? <span>القوة: {effort}</span> : null}
        {job.status === 'running' ? (
          <span className="inline-flex items-center gap-1 text-ab-accent">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            {formatEtaAr(job.etaSeconds, elapsed)}
          </span>
        ) : job.status === 'waiting' ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden />
            {formatEtaAr(job.etaSeconds)}
          </span>
        ) : job.durationMs != null ? (
          <span>{formatDurationAr(job.durationMs)}</span>
        ) : null}
      </p>

      <div className="min-h-0 flex-1 overflow-hidden">
        {job.errorAr ? (
          <p className="line-clamp-4 text-[12px] text-red-800">{job.errorAr}</p>
        ) : job.resultText ? (
          <div
            className={cn(
              'whitespace-pre-wrap text-[12px] leading-relaxed text-ab-ink',
              expanded ? 'max-h-48 overflow-y-auto' : 'line-clamp-4'
            )}
            dir="rtl"
          >
            {job.resultText}
          </div>
        ) : job.status === 'running' ? (
          <p className="text-[12px] text-stone-500">جاري التنفيذ…</p>
        ) : job.status === 'waiting' ? (
          <p className="text-[12px] text-stone-500">في الطابور…</p>
        ) : null}
      </div>

      {resultFiles.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-black/5 pt-2">
          {resultFiles.map((f) => (
            <li
              key={f.fileId}
              draggable
              onDragStart={(e) => {
                setBridgeDragData(e.dataTransfer, {
                  ...f,
                  kind: f.kind || 'edited',
                  edited: true,
                })
              }}
              className="flex flex-wrap items-center gap-1 rounded-md border border-ab-border/70 bg-white/80 px-1.5 py-1"
              title="اسحب إلى لوحة تيليجرام لإرسال للمجموعة"
            >
              <FileText
                className="h-3 w-3 shrink-0 text-ab-accent"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">
                {f.name}
              </span>
              <button
                type="button"
                disabled={tgBusyId === f.fileId}
                onClick={() => void sendFileToTelegram(f)}
                className="inline-flex items-center gap-0.5 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold text-sky-900"
              >
                <MessageCircle className="h-2.5 w-2.5" aria-hidden />
                {tgBusyId === f.fileId ? '…' : 'أرسل لتيليجرام'}
              </button>
            </li>
          ))}
          {tgNote ? (
            <li className="text-[10px] text-emerald-800">{tgNote}</li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-black/5 pt-2">
        {(job.resultText && job.resultText.length > 160) ||
        (job.usedTools && job.usedTools.length > 0) ? (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-ab-accent hover:bg-ab-accent/10"
          >
            <Maximize2 className="h-3 w-3" aria-hidden />
            {expanded ? 'طيّ' : 'توسيع'}
          </button>
        ) : null}
        {job.pendingApprovalIds?.length ? (
          <button
            type="button"
            onClick={() => onNavigate?.('approvals')}
            className="rounded-md border border-ab-warn/40 bg-ab-warn/10 px-1.5 py-0.5 text-[10px] font-semibold text-ab-warn"
          >
            موافقة معلّقة
          </button>
        ) : null}
        {expanded && job.usedTools && job.usedTools.length > 0 ? (
          <ul className="w-full space-y-0.5 pt-1">
            {job.usedTools.map((t, i) => (
              <li key={`${t.name}-${i}`} className="text-[10px] text-stone-600">
                <span className="font-semibold text-ab-ink">{t.labelAr}</span>{' '}
                {t.summaryAr}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
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
  const resolvePrefs = useModelPickerStore((s) => s.resolveForScope)
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [imapConnected, setImapConnected] = useState<boolean | null>(null)
  const [cuaStatusAr, setCuaStatusAr] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [connectingGoogle, setConnectingGoogle] = useState(false)
  const [error, setError] = useState('')
  const [jobs, setJobs] = useState<AssistantJob[]>([])
  const [maxParallel, setMaxParallel] = useState(8)
  const [maxPerUser, setMaxPerUser] = useState(8)
  const [hintAr, setHintAr] = useState(
    'حتى 8 مهام معاً لكل موظف؛ الباقي بالانتظار.'
  )
  const [enqueueBusy, setEnqueueBusy] = useState(false)
  const [barOpen, setBarOpen] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [pendingFiles, setPendingFiles] = useState<BridgeFilePayload[]>([])
  const [composerDrag, setComposerDrag] = useState(false)
  const [micNote, setMicNote] = useState('')
  const [tgMobileOpen, setTgMobileOpen] = useState(false)
  const inFlight = useRef(new Set<string>())
  const drainLock = useRef(false)

  const attachPendingFile = useCallback((file: BridgeFilePayload) => {
    setPendingFiles((prev) => {
      if (prev.some((p) => p.fileId === file.fileId)) return prev
      return [...prev, { ...file, scopeId: file.scopeId || scopeId }]
    })
  }, [scopeId])

  useEffect(() => {
    const onAttach = (e: Event) => {
      const detail = (e as CustomEvent<BridgeFilePayload>).detail
      if (detail?.fileId) attachPendingFile(detail)
    }
    window.addEventListener(AB_ATTACH_ASSISTANTS, onAttach)
    return () => window.removeEventListener(AB_ATTACH_ASSISTANTS, onAttach)
  }, [attachPendingFile])

  const applyLimits = useCallback(
    (data: { maxParallel?: number; maxPerUser?: number; hintAr?: string }) => {
      if (typeof data.maxParallel === 'number') setMaxParallel(data.maxParallel)
      if (typeof data.maxPerUser === 'number') setMaxPerUser(data.maxPerUser)
      else if (typeof data.maxParallel === 'number') setMaxPerUser(data.maxParallel)
      if (data.hintAr) setHintAr(data.hintAr)
    },
    []
  )

  useEffect(() => {
    void fetch('/api/assistants')
      .then((r) => r.json())
      .then((d: CatalogResponse) => {
        setCatalog(d)
        applyLimits(d)
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
  }, [initialAssistantId, applyLimits])

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
      applyLimits(data)
      setJobs((prev) => mergeJobs(prev, data.jobs || []))
    } catch {
      /* local cache still shown */
    }
  }, [scopeId, signedIn, applyLimits])

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
          maxPerUser?: number
          hintAr?: string
          blocked?: { messageAr: string }
          error?: string
        }
        applyLimits(data)
        if (data.job) {
          setJobs((prev) => mergeJobs(prev, [data.job!]))
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
    [scopeId, applyLimits]
  )

  const drainCap = Math.min(maxPerUser, maxParallel)

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
      const slots = Math.max(0, drainCap - activeIds.size)
      const batch = waiting.slice(0, slots)
      for (const j of batch) {
        void processJob(j.id)
      }
    } finally {
      drainLock.current = false
    }
  }, [jobs, drainCap, processJob, signedIn])

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
    const base = message.trim()
    if (!base && pendingFiles.length === 0) {
      setError('اكتب ما تريده في خانة الطلب أو أرفق ملفاً من تيليجرام.')
      return
    }
    const fileHints = pendingFiles.map((f) => composerHintForFile(f)).join('\n')
    const text = [base, fileHints].filter(Boolean).join('\n\n')
    setEnqueueBusy(true)
    try {
      const prefs = resolvePrefs(scopeId)
      const headers = {
        ...(await authHeaders()),
        'Content-Type': 'application/json',
      }
      const res = await fetch('/api/assistants/queue', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text,
          scopeId,
          modelSlug: prefs.model,
          effortLevel: prefs.effort,
        }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        job?: AssistantJob
        maxParallel?: number
        maxPerUser?: number
        hintAr?: string
        error?: string
      }
      if (!res.ok || !data.job) {
        setError(data.error || 'تعذّر إضافة المهمة')
        return
      }
      applyLimits(data)
      setJobs((prev) => mergeJobs(prev, [data.job!]))
      setMessage('')
      setPendingFiles([])
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

  const gridJobs = useMemo(() => {
    const active = [...running, ...waiting]
    const recent = done.slice(0, 12)
    const seen = new Set<string>()
    const out: AssistantJob[] = []
    for (const j of [...active, ...recent]) {
      if (seen.has(j.id)) continue
      seen.add(j.id)
      out.push(j)
    }
    return out
  }, [running, waiting, done])

  void tick

  const telegramPane = (
    <TelegramMirrorChat
      variant="embedded"
      className="min-h-[28rem] lg:min-h-0 lg:sticky lg:top-3 lg:h-[min(36rem,calc(100dvh-5rem))]"
      onSendToAssistants={attachPendingFile}
      onSendToRoom={(file) => {
        dispatchAttachRoom(file)
        onNavigate?.('chats')
      }}
    />
  )

  return (
    <section
      className="relative mx-auto w-full max-w-6xl space-y-3 px-4 py-3 pb-36 md:px-6"
      dir="rtl"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-3">
      <header className="ab-page-head !pb-2">
        <div className="min-w-0">
          <h2 className="ab-title">{catalog?.titleAr || 'مهام التشغيل'}</h2>
          <p className="ab-subtitle !mt-0.5 !text-[13px] !leading-snug">
            {catalog?.subtitleAr ||
              'مهام تشغيل للمساحة على البريد والتقويم. للنقاش الحي مع الوكلاء استخدم غرفة الفريق.'}
          </p>
        </div>
      </header>

      <div
        className={cn(
          'ab-composer',
          composerDrag && 'ring-2 ring-ab-accent/40'
        )}
        onDragOver={(e) => {
          e.preventDefault()
          if (e.dataTransfer.types.includes(AB_FILE_DND)) {
            setComposerDrag(true)
          }
        }}
        onDragLeave={() => setComposerDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setComposerDrag(false)
          const file = getBridgeDragData(e.dataTransfer)
          if (file) attachPendingFile(file)
        }}
      >
        {micNote ? (
          <p
            className="mb-1.5 rounded-md border border-ab-border bg-white px-2 py-1 text-[11px] leading-snug text-stone-700"
            role="status"
          >
            {micNote}
          </p>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-[13px] font-bold text-ab-ink">
            ماذا تريد تنفيذه؟
          </span>
          <div className="flex items-end gap-1.5">
            <ComposerMicButton
              disabled={enqueueBusy || signedIn !== true}
              composerValue={message}
              showHint
              onStatus={setMicNote}
              onPartial={(text) => setMessage(text)}
              onRestore={(text) => setMessage(text)}
              onTranscript={(text, meta) => {
                setMessage(text)
                setMicNote(
                  meta?.providerLabelAr
                    ? `نُسخ عبر ${meta.providerLabelAr} — راجع ثم أرسل يدوياً (لا تلقائي)`
                    : 'النص في المربع — راجع ثم أرسل أو ⌘/Ctrl+Enter'
                )
              }}
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              dir="rtl"
              placeholder="مثال: فرّز بريدي اليوم… أو تكلم بالميكروفون — النص يظهر هنا ثم أرسل يدوياً"
              className="ab-input min-h-[2.75rem] max-h-28 min-w-0 flex-1 resize-y !py-2 text-[13px] leading-snug"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void enqueue()
                }
              }}
            />
          </div>
        </label>

        {pendingFiles.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {pendingFiles.map((f) => (
              <li
                key={f.fileId}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-ab-accent/25 bg-ab-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-ab-accent"
              >
                <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-ab-accent/20"
                  aria-label="إزالة المرفق"
                  onClick={() =>
                    setPendingFiles((prev) =>
                      prev.filter((p) => p.fileId !== f.fileId)
                    )
                  }
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="ab-toolbar mt-2 flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <ModelPicker compact scopeId={scopeId} />
            <EffortPicker compact scopeId={scopeId} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={enqueueBusy || signedIn !== true}
              onClick={() => void enqueue()}
              className="ab-btn-primary px-3.5 py-1.5 text-xs"
            >
              {enqueueBusy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  جاري الإضافة…
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  إرسال
                </>
              )}
            </button>
            <span className="text-[10px] text-ab-muted">
              ⌘/Ctrl + Enter
            </span>
          </div>
        </div>
        {error ? (
          <p className="mt-1.5 text-[13px] text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div>
        <AssistantsOpsSeatsStrip
          className="mt-0"
          maxParallel={maxParallel}
          maxPerUser={maxPerUser}
          jobs={jobs}
          poolOnline={signedIn === true}
        />

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-md border border-ab-accent/25 bg-ab-accent/10 px-2 py-0.5 text-[11px] font-bold text-ab-accent"
            title={catalog?.parallelNoteAr || hintAr}
          >
            حدّ لكل موظف: {maxPerUser} متوازية
            {maxParallel !== maxPerUser ? (
              <span className="font-medium text-ab-accent/80">
                · مساحة {maxParallel}
              </span>
            ) : null}
          </span>
          <span className="text-[11px] text-ab-muted">{hintAr}</span>
          <button
            type="button"
            className="ab-btn-secondary gap-1 lg:hidden"
            onClick={() => setTgMobileOpen((o) => !o)}
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            {tgMobileOpen ? 'إخفاء تيليجرام' : 'تيليجرام مباشر'}
          </button>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-ab-muted">
          اسحب صوتاً/ملفاً من تيليجرام إلى خانة الطلب أو اضغط «للمساعدين». اسحب
          ملفاً معدَّلاً من بطاقة المهمة إلى لوحة تيليجرام لإرساله للمجموعة فوراً.
        </p>
        {canAccessOpsUi && cuaStatusAr !== null ? (
          <p className="mt-1 text-[11px] text-ab-muted">
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

      {tgMobileOpen ? (
        <div className="lg:hidden">{telegramPane}</div>
      ) : null}

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

      {/* Multi-task grid — one small pane per job */}
      {gridJobs.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-ab-ink">المهام</h3>
            <p className="text-[11px] text-ab-muted">
              نشط {running.length}/{drainCap} · انتظار {waiting.length}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {gridJobs.map((j) => (
              <TaskPane
                key={j.id}
                job={j}
                expanded={expandedId === j.id}
                onToggle={() =>
                  setExpandedId((id) => (id === j.id ? null : j.id))
                }
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="ab-empty !px-3 !py-4 text-[12px] !text-ab-muted">
          لا مهام بعد — اكتب طلبك أعلاه ثم اضغط إرسال. كل مهمة تظهر كورقة صغيرة
          هنا.
        </p>
      )}
        </div>

        <aside className="hidden w-full shrink-0 lg:block lg:w-[min(20rem,30%)]">
          {telegramPane}
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ab-border bg-white/95 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md md:ms-[var(--ab-sidebar-width)]">
        <div className="mx-auto max-w-6xl px-4 py-2" dir="rtl">
          <button
            type="button"
            onClick={() => setBarOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 py-1 text-start"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px]">
              <ListTodo className="h-4 w-4 shrink-0 text-ab-accent" aria-hidden />
              <span className="font-bold text-ab-ink">طابور المهام</span>
              <span className="rounded-md bg-ab-accent/10 px-1.5 py-0.5 font-semibold text-ab-accent">
                نشط {running.length}/{drainCap}
              </span>
              <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-stone-700">
                انتظار {waiting.length}
              </span>
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                منجز {done.filter((j) => j.status === 'done').length}
              </span>
            </div>
            {barOpen ? (
              <ChevronDown className="h-4 w-4 text-stone-500" aria-hidden />
            ) : (
              <ChevronUp className="h-4 w-4 text-stone-500" aria-hidden />
            )}
          </button>

          {barOpen ? (
            <div className="max-h-[28vh] space-y-1.5 overflow-y-auto pb-2 pt-1">
              {running.length === 0 &&
              waiting.length === 0 &&
              done.length === 0 ? (
                <p className="ab-empty !py-3 text-[12px] !text-ab-muted">
                  لا مهام بعد — اكتب طلبك أعلاه ثم اضغط إرسال.
                </p>
              ) : null}

              {[...running, ...waiting].map((j) => (
                <div
                  key={j.id}
                  className="flex items-start gap-2 rounded-lg border border-ab-border bg-white px-3 py-2"
                >
                  {j.status === 'running' ? (
                    <Loader2
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-ab-accent"
                      aria-hidden
                    />
                  ) : (
                    <Clock
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ab-muted-soft"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-ab-ink">
                      {j.message}
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-500">
                      {j.assistantNameAr} ·{' '}
                      {j.status === 'running' ? 'نشط' : 'انتظار'}
                    </p>
                  </div>
                </div>
              ))}

              {done.length > 0 ? (
                <div className="border-t border-stone-100 pt-2">
                  <p className="mb-1 text-[11px] font-bold text-stone-600">
                    منجَز سابقاً
                  </p>
                  {done.slice(0, 6).map((j) => (
                    <div
                      key={j.id}
                      className="mb-1 flex items-start gap-2 rounded-lg px-3 py-1.5"
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
                    </div>
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
