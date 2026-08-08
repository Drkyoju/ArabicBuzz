/**
 * Incomplete Telegram file-work jobs: pending / waiting_file / running / done / failed.
 * Resume from vault bytes, exact room/Drive name, or live telegram file_id — never nag resend.
 */
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { matchWorkspaceFileExact } from '@/lib/files/file-source-policy'
import {
  isMuallimSeerahShortQuery,
  matchMuallimSeerahFile,
  pickMuallimSeerahFile,
} from '@/lib/files/muallim-seerah-match'
import {
  getRecoverableTelegramAttachment,
  telegramFileNeverStoredAr,
  type PersistedTelegramAttachment,
} from '@/lib/telegram/attachment-persist'

export type TelegramFileJobStatus =
  | 'pending'
  | 'running'
  | 'waiting_file'
  | 'done'
  | 'failed'

export type TelegramFileJob = {
  id: string
  chatId: string
  scopeId: string
  userId: string
  status: TelegramFileJobStatus
  requestText: string
  expectedFilename: string
  attachmentId?: string
  vaultFileId?: string
  telegramFileId?: string
  workKind: string
  workParams: Record<string, unknown>
  lastErrorAr?: string
  notifiedWaitingFile: boolean
  resultVaultFileId?: string
  resultName?: string
  createdAt: string
  updatedAt: string
}

const TABLE = 'telegram_file_jobs'
const mem = new Map<string, TelegramFileJob>()

function rowToJob(r: Record<string, unknown>): TelegramFileJob {
  let workParams: Record<string, unknown> = {}
  const raw = r.work_params
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    workParams = raw as Record<string, unknown>
  } else if (typeof raw === 'string') {
    try {
      workParams = JSON.parse(raw) as Record<string, unknown>
    } catch {
      workParams = {}
    }
  }
  return {
    id: String(r.id),
    chatId: String(r.chat_id),
    scopeId: String(r.scope_id),
    userId: String(r.user_id || ''),
    status: (r.status as TelegramFileJobStatus) || 'pending',
    requestText: String(r.request_text || ''),
    expectedFilename: String(r.expected_filename || ''),
    attachmentId: r.attachment_id ? String(r.attachment_id) : undefined,
    vaultFileId: r.vault_file_id ? String(r.vault_file_id) : undefined,
    telegramFileId: r.telegram_file_id
      ? String(r.telegram_file_id)
      : undefined,
    workKind: String(r.work_kind || 'file'),
    workParams,
    lastErrorAr: r.last_error_ar ? String(r.last_error_ar) : undefined,
    notifiedWaitingFile: Boolean(r.notified_waiting_file),
    resultVaultFileId: r.result_vault_file_id
      ? String(r.result_vault_file_id)
      : undefined,
    resultName: r.result_name ? String(r.result_name) : undefined,
    createdAt: String(r.created_at || new Date().toISOString()),
    updatedAt: String(r.updated_at || new Date().toISOString()),
  }
}

function jobToRow(j: TelegramFileJob): Record<string, unknown> {
  return {
    id: j.id,
    chat_id: j.chatId,
    scope_id: j.scopeId,
    user_id: j.userId,
    status: j.status,
    request_text: j.requestText,
    expected_filename: j.expectedFilename,
    attachment_id: j.attachmentId || null,
    vault_file_id: j.vaultFileId || null,
    telegram_file_id: j.telegramFileId || null,
    work_kind: j.workKind,
    work_params: j.workParams,
    last_error_ar: j.lastErrorAr || null,
    notified_waiting_file: j.notifiedWaitingFile,
    result_vault_file_id: j.resultVaultFileId || null,
    result_name: j.resultName || null,
    created_at: j.createdAt,
    updated_at: j.updatedAt,
  }
}

async function upsertJob(job: TelegramFileJob): Promise<TelegramFileJob> {
  mem.set(job.id, job)
  const sb = getSupabaseAdmin()
  if (sb) {
    try {
      const { error } = await sb.from(TABLE).upsert(jobToRow(job) as never)
      if (error) console.error('[telegram] file job upsert', error.message)
    } catch (e) {
      console.error('[telegram] file job upsert', e)
    }
  }
  return job
}

export async function enqueueTelegramFileJob(opts: {
  chatId: string
  scopeId: string
  userId?: string
  requestText: string
  expectedFilename?: string
  attachmentId?: string
  vaultFileId?: string
  telegramFileId?: string
  workKind?: string
  workParams?: Record<string, unknown>
  status?: TelegramFileJobStatus
}): Promise<TelegramFileJob> {
  const now = new Date().toISOString()
  const hasBytes = Boolean(opts.vaultFileId)
  const job: TelegramFileJob = {
    id: randomUUID(),
    chatId: opts.chatId,
    scopeId: opts.scopeId,
    userId: opts.userId || '',
    status:
      opts.status ||
      (hasBytes ? 'pending' : 'waiting_file'),
    requestText: opts.requestText.trim(),
    expectedFilename: (opts.expectedFilename || '').trim(),
    attachmentId: opts.attachmentId,
    vaultFileId: opts.vaultFileId,
    telegramFileId: opts.telegramFileId,
    workKind: opts.workKind || 'file',
    workParams: opts.workParams || {},
    notifiedWaitingFile: false,
    createdAt: now,
    updatedAt: now,
  }
  return upsertJob(job)
}

export async function updateTelegramFileJob(
  id: string,
  patch: Partial<
    Pick<
      TelegramFileJob,
      | 'status'
      | 'vaultFileId'
      | 'telegramFileId'
      | 'attachmentId'
      | 'expectedFilename'
      | 'lastErrorAr'
      | 'notifiedWaitingFile'
      | 'resultVaultFileId'
      | 'resultName'
      | 'workParams'
      | 'requestText'
    >
  >
): Promise<TelegramFileJob | null> {
  let job = mem.get(id) || null
  const sb = getSupabaseAdmin()
  if (!job && sb) {
    try {
      const { data } = await sb.from(TABLE).select('*').eq('id', id).maybeSingle()
      if (data) job = rowToJob(data as Record<string, unknown>)
    } catch {
      /* ignore */
    }
  }
  if (!job) return null
  const next: TelegramFileJob = {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  return upsertJob(next)
}

export async function listOpenTelegramFileJobs(opts?: {
  chatId?: string
  scopeId?: string
  limit?: number
}): Promise<TelegramFileJob[]> {
  const limit = Math.max(1, opts?.limit ?? 20)
  const open = new Set<TelegramFileJobStatus>([
    'pending',
    'waiting_file',
    'failed',
  ])
  const fromMem = [...mem.values()]
    .filter((j) => {
      if (!open.has(j.status)) return false
      if (opts?.chatId && j.chatId !== opts.chatId) return false
      if (opts?.scopeId && j.scopeId !== opts.scopeId) return false
      return true
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)

  const sb = getSupabaseAdmin()
  if (!sb) return fromMem
  try {
    let q = sb
      .from(TABLE)
      .select('*')
      .in('status', ['pending', 'waiting_file', 'failed'])
      .order('created_at', { ascending: false })
      .limit(limit)
    if (opts?.chatId) q = q.eq('chat_id', opts.chatId)
    if (opts?.scopeId) q = q.eq('scope_id', opts.scopeId)
    const { data, error } = await q
    if (error || !data?.length) return fromMem
    const rows = (data as Record<string, unknown>[]).map(rowToJob)
    for (const r of rows) mem.set(r.id, r)
    return rows
  } catch {
    return fromMem
  }
}

/**
 * Infer structured PDF page-duplicate intent from Arabic/English requests.
 */
export function inferPdfDuplicateWorkParams(
  requestText: string
): { copyPage: number; afterPage: number } | null {
  const t = requestText.replace(/\s+/g, ' ')
  // «كرر/انسخ صفحة 48 بعد 45»
  const m1 = t.match(
    /(?:كرر|كرّر|انسخ|نسخ|duplicate|copy)\s*(?:صفحة|صفحه|page)?\s*(\d{1,4})\s*(?:بعد|after)\s*(?:صفحة|صفحه|page)?\s*(\d{1,4})/i
  )
  if (m1) {
    return { copyPage: Number(m1[1]), afterPage: Number(m1[2]) }
  }
  const m2 = t.match(
    /(?:صفحة|صفحه|page)\s*(\d{1,4})\s*(?:بعد|after)\s*(?:صفحة|صفحه|page)?\s*(\d{1,4})/i
  )
  if (m2 && /كرر|كرّر|انسخ|نسخ|duplicate|copy|ضع|حط/i.test(t)) {
    return { copyPage: Number(m2[1]), afterPage: Number(m2[2]) }
  }
  return null
}

export type ResolvedJobFile = {
  vaultFileId: string
  source: 'job_vault' | 'attachment' | 'room_exact' | 'drive_exact'
  fileName: string
}

/**
 * Exhaust recovery paths. Exact filename only for room/Drive (no fuzzy biology).
 */
export async function resolveTelegramJobFile(
  job: TelegramFileJob
): Promise<ResolvedJobFile | null> {
  if (job.vaultFileId) {
    try {
      const { readWorkspaceFile } = await import('@/lib/documents/workspace')
      const hit = await readWorkspaceFile(job.scopeId, job.vaultFileId)
      if (hit.buffer?.length) {
        return {
          vaultFileId: job.vaultFileId,
          source: 'job_vault',
          fileName: hit.meta.originalName || job.expectedFilename,
        }
      }
    } catch {
      /* try other paths */
    }
  }

  const att = await getRecoverableTelegramAttachment(job.chatId)
  if (att?.hasBytes && att.vaultFileId) {
    if (
      !job.expectedFilename ||
      filenamesStrictMatch(att.fileName, job.expectedFilename)
    ) {
      return {
        vaultFileId: att.vaultFileId,
        source: 'attachment',
        fileName: att.fileName,
      }
    }
  }

  const expected = job.expectedFilename.trim()
  if (!expected) return null

  try {
    const { listWorkspaceFiles } = await import('@/lib/documents/workspace')
    const files = await listWorkspaceFiles(job.scopeId)
    let hit = matchWorkspaceFileExact(files, expected)
    if (!hit && isMuallimSeerahShortQuery(expected)) {
      hit = pickMuallimSeerahFile(files, expected)
    }
    if (hit) {
      return {
        vaultFileId: hit.id,
        source: 'room_exact',
        fileName: hit.originalName,
      }
    }
  } catch {
    /* ignore */
  }

  // Drive: exact name, or seerah short-name alias (never أحياء).
  try {
    const { searchDriveBrainExactName } = await import(
      '@/lib/telegram/drive-exact-recover'
    )
    const driveHit = await searchDriveBrainExactName({
      scopeId: job.scopeId,
      exactName: expected,
      allowMuallimSeerahAlias: isMuallimSeerahShortQuery(expected),
    })
    if (driveHit?.vaultFileId) {
      return {
        vaultFileId: driveHit.vaultFileId,
        source: 'drive_exact',
        fileName: driveHit.fileName,
      }
    }
  } catch {
    /* optional */
  }

  return null
}

export function filenamesStrictMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\u0640]/g, '') // tatweel
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
  const na = norm(a)
  const nb = norm(b)
  if (na === nb) return true
  const base = (s: string) => s.replace(/\.[^.]+$/, '')
  if (base(na) === base(nb)) return true
  // Short «المعلم الاول» ↔ full seerah title (never أحياء)
  if (
    (isMuallimSeerahShortQuery(a) && matchMuallimSeerahFile(b)) ||
    (isMuallimSeerahShortQuery(b) && matchMuallimSeerahFile(a))
  ) {
    return true
  }
  return false
}

/**
 * May we ask the user once for a room/Drive upload?
 * Only when zero recovery paths exist (no bytes, no live file_id, not on room/Drive).
 */
export async function shouldNotifyWaitingFileOnce(
  job: TelegramFileJob
): Promise<{ notify: boolean; messageAr?: string }> {
  if (job.notifiedWaitingFile) return { notify: false }
  if (job.vaultFileId) return { notify: false }
  const resolved = await resolveTelegramJobFile(job)
  if (resolved) return { notify: false }
  // Still have telegram_file_id — try getFile later; don't nag with "never stored".
  if (job.telegramFileId) return { notify: false }
  return {
    notify: true,
    messageAr: telegramFileNeverStoredAr(job.expectedFilename || undefined),
  }
}

export function buildResumePromptForJob(
  job: TelegramFileJob,
  resolved: ResolvedJobFile
): string {
  const dup = inferPdfDuplicateWorkParams(job.requestText)
  const params =
    dup ||
    (typeof job.workParams.copyPage === 'number' &&
    typeof job.workParams.afterPage === 'number'
      ? {
          copyPage: Number(job.workParams.copyPage),
          afterPage: Number(job.workParams.afterPage),
        }
      : null)

  const lines = [
    job.requestText || 'أكمل المهمة المعلّقة على هذا الملف.',
    '',
    `[استئناف مهمة تيليجرام #${job.id.slice(0, 8)}]`,
    `ملف العمل: «${resolved.fileName}» (fileId=${resolved.vaultFileId}, مصدر=${resolved.source}).`,
    'نفّذ على هذا fileId مباشرة ثم return_file كمرفق تيليجرام. ممنوع استبدال بملف آخر بالاسم.',
  ]
  if (params) {
    lines.push(
      `استدعِ pdf_duplicate_page فوراً: copyPage=${params.copyPage} afterPage=${params.afterPage} fileId=${resolved.vaultFileId} ثم return_file.`
    )
  }
  return lines.join('\n')
}

export async function markJobWaitingFileNotified(
  jobId: string
): Promise<void> {
  await updateTelegramFileJob(jobId, { notifiedWaitingFile: true })
}

/**
 * When a new vault file appears, link open waiting_file jobs by exact name.
 */
export async function bindWaitingJobsToNewVaultFile(opts: {
  chatId?: string
  scopeId: string
  vaultFileId: string
  fileName: string
}): Promise<TelegramFileJob[]> {
  const open = await listOpenTelegramFileJobs({
    chatId: opts.chatId,
    scopeId: opts.scopeId,
    limit: 40,
  })
  const bound: TelegramFileJob[] = []
  for (const job of open) {
    if (job.status !== 'waiting_file' && job.status !== 'failed') continue
    if (
      job.expectedFilename &&
      !filenamesStrictMatch(job.expectedFilename, opts.fileName)
    ) {
      continue
    }
    if (!job.expectedFilename && opts.chatId && job.chatId !== opts.chatId) {
      continue
    }
    const updated = await updateTelegramFileJob(job.id, {
      status: 'pending',
      vaultFileId: opts.vaultFileId,
      expectedFilename: job.expectedFilename || opts.fileName,
      lastErrorAr: undefined,
    })
    if (updated) bound.push(updated)
  }
  return bound
}

export function clearTelegramFileJobsForTests(): void {
  mem.clear()
}

export function attachmentHintForJob(
  att: PersistedTelegramAttachment | null
): string {
  if (!att) return ''
  if (att.hasBytes && att.vaultFileId) {
    return `مرفق محفوظ: «${att.fileName}» (fileId=${att.vaultFileId}).`
  }
  if (att.telegramFileId) {
    return `مرفق مسجّل بدون بايتات بعد: «${att.fileName}» (telegram_file_id موجود — حاول الاستعادة قبل طلب الرفع).`
  }
  return `مرفق مسجّل: «${att.fileName}» — بانتظار ظهوره في الغرفة/Drive.`
}
