/**
 * Assistant task queue — per scope. Supabase + in-memory fallback
 * (same pattern as room_tasks). Client drains waiting jobs up to
 * ASSISTANT_MAX_PARALLEL via /api/assistants/queue/process.
 */
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import {
  estimateAssistantEtaSeconds,
  routeAssistantIntent,
} from '@/lib/assistants/intent-router'
import { getAssistantMaxParallel, getAssistantMaxPerUser } from '@/lib/assistants/parallel'
import type {
  AssistantId,
  AssistantJob,
  AssistantJobStatus,
  AssistantUsedTool,
} from '@/lib/assistants/types'

export type { AssistantJob, AssistantJobStatus }

type DbRow = Record<string, unknown>
const mem = new Map<string, AssistantJob>()

function rowToJob(r: DbRow): AssistantJob {
  let usedTools: AssistantUsedTool[] = []
  const rawTools = r.used_tools
  if (Array.isArray(rawTools)) {
    usedTools = rawTools as AssistantUsedTool[]
  } else if (typeof rawTools === 'string') {
    try {
      usedTools = JSON.parse(rawTools) as AssistantUsedTool[]
    } catch {
      usedTools = []
    }
  }

  let pending: string[] = []
  const rawPending = r.pending_approval_ids
  if (Array.isArray(rawPending)) {
    pending = rawPending.map(String)
  } else if (typeof rawPending === 'string') {
    try {
      pending = (JSON.parse(rawPending) as unknown[]).map(String)
    } catch {
      pending = []
    }
  }

  return {
    id: String(r.id),
    scopeId: String(r.scope_id),
    userId: String(r.user_id || ''),
    message: String(r.message || ''),
    assistantId: String(r.assistant_id || 'general') as AssistantId,
    assistantNameAr: String(r.assistant_name_ar || 'مساعد'),
    matchedBy: String(r.matched_by || 'default'),
    status: (r.status as AssistantJobStatus) || 'waiting',
    resultText: r.result_text != null ? String(r.result_text) : null,
    usedTools,
    pendingApprovalIds: pending,
    errorAr: r.error_ar != null ? String(r.error_ar) : null,
    etaSeconds: Number(r.eta_seconds ?? 40),
    startedAt: r.started_at != null ? String(r.started_at) : null,
    finishedAt: r.finished_at != null ? String(r.finished_at) : null,
    durationMs: r.duration_ms != null ? Number(r.duration_ms) : null,
    modelSlug: r.model_slug != null ? String(r.model_slug) : null,
    effortLevel: r.effort_level != null ? String(r.effort_level) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

function jobToRow(job: AssistantJob): Record<string, unknown> {
  return {
    id: job.id,
    scope_id: job.scopeId,
    user_id: job.userId,
    message: job.message,
    assistant_id: job.assistantId,
    assistant_name_ar: job.assistantNameAr,
    matched_by: job.matchedBy,
    status: job.status,
    result_text: job.resultText,
    used_tools: job.usedTools,
    pending_approval_ids: job.pendingApprovalIds,
    error_ar: job.errorAr,
    eta_seconds: job.etaSeconds,
    started_at: job.startedAt,
    finished_at: job.finishedAt,
    duration_ms: job.durationMs,
    model_slug: job.modelSlug,
    effort_level: job.effortLevel,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  }
}

export async function listAssistantJobs(
  scopeId: string,
  opts?: { limit?: number; includeDone?: boolean }
): Promise<AssistantJob[]> {
  const limit = Math.min(100, Math.max(1, opts?.includeDone === false ? 40 : opts?.limit ?? 60))
  const sb = getSupabaseAdmin()
  if (sb) {
    let q = sb
      .from('assistant_jobs')
      .select('*')
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (opts?.includeDone === false) {
      q = q.in('status', ['waiting', 'running'])
    }
    const { data, error } = await q
    if (!error && data) {
      return (data as DbRow[]).map(rowToJob).reverse()
    }
  }
  return [...mem.values()]
    .filter((j) => j.scopeId === scopeId)
    .filter(
      (j) =>
        opts?.includeDone !== false ||
        j.status === 'waiting' ||
        j.status === 'running'
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-limit)
}

export async function countRunningJobs(scopeId: string): Promise<number> {
  const jobs = await listAssistantJobs(scopeId, { includeDone: false, limit: 100 })
  return jobs.filter((j) => j.status === 'running').length
}

export async function countRunningJobsForUser(
  scopeId: string,
  userId: string
): Promise<number> {
  if (!userId) return 0
  const jobs = await listAssistantJobs(scopeId, { includeDone: false, limit: 100 })
  return jobs.filter((j) => j.status === 'running' && j.userId === userId).length
}

export async function enqueueAssistantJob(opts: {
  scopeId: string
  userId: string
  message: string
  assistantId?: string | null
  modelSlug?: string | null
  effortLevel?: string | null
}): Promise<{
  job: AssistantJob
  maxParallel: number
  maxPerUser: number
}> {
  const message = opts.message.trim()
  if (!message) throw new Error('اكتب ما تريده بالعربية')

  const route = routeAssistantIntent(message, opts.assistantId)
  const now = new Date().toISOString()
  const job: AssistantJob = {
    id: randomUUID(),
    scopeId: opts.scopeId,
    userId: opts.userId,
    message,
    assistantId: route.assistantId,
    assistantNameAr: route.assistant.nameAr,
    matchedBy: route.matchedBy,
    status: 'waiting',
    resultText: null,
    usedTools: [],
    pendingApprovalIds: [],
    errorAr: null,
    etaSeconds: estimateAssistantEtaSeconds(route.assistantId),
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    modelSlug: opts.modelSlug?.trim() || null,
    effortLevel: opts.effortLevel?.trim() || null,
    createdAt: now,
    updatedAt: now,
  }

  const sb = getSupabaseAdmin()
  if (sb) {
    const row = jobToRow(job)
    let { error } = await sb.from('assistant_jobs').insert(row)
    if (error && /model_slug|effort_level|column/i.test(error.message)) {
      const legacy = { ...row }
      delete legacy.model_slug
      delete legacy.effort_level
      ;({ error } = await sb.from('assistant_jobs').insert(legacy))
    }
    if (error) {
      console.error('[assistant_jobs] insert', error.message)
      mem.set(job.id, job)
    }
  } else {
    mem.set(job.id, job)
  }

  return {
    job,
    maxParallel: getAssistantMaxParallel(),
    maxPerUser: getAssistantMaxPerUser(),
  }
}

export async function getAssistantJob(
  id: string,
  scopeId?: string
): Promise<AssistantJob | null> {
  const sb = getSupabaseAdmin()
  if (sb) {
    const { data, error } = await sb
      .from('assistant_jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (!error && data) {
      const job = rowToJob(data as DbRow)
      if (scopeId && job.scopeId !== scopeId) return null
      return job
    }
  }
  const m = mem.get(id)
  if (!m) return null
  if (scopeId && m.scopeId !== scopeId) return null
  return m
}

/** Claim waiting → running if under scope + per-user parallel caps. */
export async function claimAssistantJob(
  jobId: string,
  scopeId: string
): Promise<
  | { ok: true; job: AssistantJob }
  | { ok: false; reason: 'not_found' | 'not_waiting' | 'at_capacity'; job?: AssistantJob }
> {
  const max = getAssistantMaxParallel()
  const maxPerUser = getAssistantMaxPerUser()
  const job = await getAssistantJob(jobId, scopeId)
  if (!job) return { ok: false, reason: 'not_found' }
  if (job.status === 'running') return { ok: true, job }
  if (job.status !== 'waiting') return { ok: false, reason: 'not_waiting', job }

  const running = await countRunningJobs(scopeId)
  if (running >= max) return { ok: false, reason: 'at_capacity', job }

  if (job.userId) {
    const userRunning = await countRunningJobsForUser(scopeId, job.userId)
    if (userRunning >= maxPerUser) {
      return { ok: false, reason: 'at_capacity', job }
    }
  }

  const now = new Date().toISOString()
  const next: AssistantJob = {
    ...job,
    status: 'running',
    startedAt: now,
    updatedAt: now,
  }
  await persistJob(next)
  return { ok: true, job: next }
}

export async function completeAssistantJob(
  jobId: string,
  patch: {
    status: 'done' | 'failed'
    resultText?: string | null
    usedTools?: AssistantUsedTool[]
    pendingApprovalIds?: string[]
    errorAr?: string | null
  }
): Promise<AssistantJob | null> {
  const job = await getAssistantJob(jobId)
  if (!job) return null
  const finishedAt = new Date().toISOString()
  const started = job.startedAt ? Date.parse(job.startedAt) : Date.parse(job.createdAt)
  const durationMs = Math.max(0, Date.now() - started)
  const next: AssistantJob = {
    ...job,
    status: patch.status,
    resultText: patch.resultText ?? job.resultText,
    usedTools: patch.usedTools ?? job.usedTools,
    pendingApprovalIds: patch.pendingApprovalIds ?? job.pendingApprovalIds,
    errorAr: patch.errorAr ?? null,
    finishedAt,
    durationMs,
    updatedAt: finishedAt,
  }
  await persistJob(next)
  return next
}

async function persistJob(job: AssistantJob): Promise<void> {
  mem.set(job.id, job)
  const sb = getSupabaseAdmin()
  if (!sb) return
  const row = jobToRow(job)
  let { error } = await sb
    .from('assistant_jobs')
    .upsert(row, { onConflict: 'id' })
  if (error && /model_slug|effort_level|column/i.test(error.message)) {
    const legacy = { ...row }
    delete legacy.model_slug
    delete legacy.effort_level
    ;({ error } = await sb
      .from('assistant_jobs')
      .upsert(legacy, { onConflict: 'id' }))
  }
  if (error) console.error('[assistant_jobs] upsert', error.message)
}

export function formatDurationAr(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} ث`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} د ${s} ث` : `${m} د`
}
