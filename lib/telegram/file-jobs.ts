/**
 * Incomplete Telegram file-work jobs: pending / waiting_file / running / done / failed.
 * Resume from vault bytes, exact room/Drive name, or live telegram file_id — never nag resend.
 */
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import {
  isMuallimSeerahShortQuery,
  matchMuallimSeerahFile,
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

function isGenericFileRequest(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  return /^(أكمل|اكمل)\s*العمل\s*على\s*الملف/.test(t) || t.length < 12
}

function preferRicherRequest(existing: string, incoming: string): string {
  const a = existing.trim()
  const b = incoming.trim()
  if (!b) return a
  if (!a || isGenericFileRequest(a)) return b
  if (isGenericFileRequest(b)) return a
  const dupA = inferPdfDuplicateWorkParams(a)
  const dupB = inferPdfDuplicateWorkParams(b)
  // Explicit empty-page correction always wins over stale «صفحة 48».
  if (dupB?.findEmptyPage) return b
  if (dupA && !dupB) return a
  if (dupB && !dupA) return b
  return b.length >= a.length ? b : a
}

/**
 * Prefer binding a resent Telegram document onto an open job that already
 * carries the real work (e.g. نسخ ص48 بعد ص45) instead of spawning a generic
 * «أكمل العمل على الملف» job that forgets the chat intent.
 */
export function pickOpenJobForIncomingFile(
  open: TelegramFileJob[],
  opts: { expectedFilename?: string; requestText?: string }
): TelegramFileJob | null {
  const name = (opts.expectedFilename || '').trim()
  const req = (opts.requestText || '').trim()
  const seerahIncoming = Boolean(name && matchMuallimSeerahFile(name))

  const eligible = open.filter((job) => {
    if (
      job.status !== 'waiting_file' &&
      job.status !== 'failed' &&
      job.status !== 'pending'
    ) {
      return false
    }
    if (name && job.expectedFilename && filenamesStrictMatch(job.expectedFilename, name)) {
      return true
    }
    if (seerahIncoming) {
      const jobSeerah =
        matchMuallimSeerahFile(job.expectedFilename) ||
        isMuallimSeerahShortQuery(job.expectedFilename) ||
        /معلم|سيرة|معالم/i.test(job.requestText)
      const hasDup =
        Boolean(inferPdfDuplicateWorkParams(job.requestText)) ||
        (typeof job.workParams.afterPage === 'number' &&
          (typeof job.workParams.copyPage === 'number' ||
            job.workParams.findEmptyPage === true))
      if (jobSeerah || hasDup) return true
    }
    if (
      req &&
      !isGenericFileRequest(req) &&
      job.expectedFilename &&
      name &&
      filenamesStrictMatch(job.expectedFilename, name)
    ) {
      return true
    }
    return false
  })
  if (!eligible.length) return null

  // Prefer the job that already carries real work (copyPage / richer request).
  const scored = eligible
    .map((job) => {
      const hasDup =
        Boolean(inferPdfDuplicateWorkParams(job.requestText)) ||
        (typeof job.workParams.afterPage === 'number' &&
          (typeof job.workParams.copyPage === 'number' ||
            job.workParams.findEmptyPage === true))
      const rich = !isGenericFileRequest(job.requestText)
      const score = (hasDup ? 100 : 0) + (rich ? 20 : 0) + job.requestText.length / 100
      return { job, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored[0]?.job || null
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
  const open = await listOpenTelegramFileJobs({
    chatId: opts.chatId,
    scopeId: opts.scopeId,
    limit: 40,
  })
  const existing = pickOpenJobForIncomingFile(open, {
    expectedFilename: opts.expectedFilename,
    requestText: opts.requestText,
  })
  if (existing) {
    const incomingDup = inferPdfDuplicateWorkParams(opts.requestText)
    const mergedParams: Record<string, unknown> = {
      ...existing.workParams,
      ...(opts.workParams || {}),
    }
    if (incomingDup) {
      mergedParams.afterPage = incomingDup.afterPage
      if (incomingDup.findEmptyPage) {
        mergedParams.findEmptyPage = true
        delete mergedParams.copyPage
      } else {
        mergedParams.copyPage = incomingDup.copyPage
        delete mergedParams.findEmptyPage
      }
    }
    const hasBytes = Boolean(opts.vaultFileId || existing.vaultFileId)
    const next = await updateTelegramFileJob(existing.id, {
      status:
        opts.status ||
        (hasBytes ? 'pending' : existing.status === 'failed' ? 'waiting_file' : existing.status),
      expectedFilename:
        (opts.expectedFilename || '').trim() || existing.expectedFilename,
      attachmentId: opts.attachmentId || existing.attachmentId,
      vaultFileId: opts.vaultFileId || existing.vaultFileId,
      telegramFileId: opts.telegramFileId || existing.telegramFileId,
      requestText: preferRicherRequest(existing.requestText, opts.requestText),
      workParams: mergedParams,
      lastErrorAr: undefined,
    })
    if (next) return next
  }

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

/**
 * Attach a live telegram file_id / attachment row onto open jobs that match
 * the filename (seerah aliases). Used when the user re-sends without caption.
 */
export async function bindOpenJobsToIncomingTelegramFile(opts: {
  chatId: string
  scopeId: string
  fileName: string
  telegramFileId?: string
  attachmentId?: string
  vaultFileId?: string
  sizeBytes?: number
}): Promise<TelegramFileJob[]> {
  const open = await listOpenTelegramFileJobs({
    chatId: opts.chatId,
    scopeId: opts.scopeId,
    limit: 40,
  })
  const target =
    pickOpenJobForIncomingFile(open, {
      expectedFilename: opts.fileName,
      requestText: '',
    }) || null
  if (!target) return []
  const next = await updateTelegramFileJob(target.id, {
    telegramFileId: opts.telegramFileId || target.telegramFileId,
    attachmentId: opts.attachmentId || target.attachmentId,
    expectedFilename: opts.fileName || target.expectedFilename,
    vaultFileId: opts.vaultFileId || target.vaultFileId,
    status: opts.vaultFileId ? 'pending' : target.status,
    lastErrorAr: undefined,
  })
  // Drop generic duplicate open jobs for the same seerah/file so agents run once.
  for (const job of open) {
    if (!next || job.id === next.id) continue
    const sameFile =
      (opts.telegramFileId && job.telegramFileId === opts.telegramFileId) ||
      (opts.fileName &&
        job.expectedFilename &&
        filenamesStrictMatch(job.expectedFilename, opts.fileName)) ||
      (matchMuallimSeerahFile(opts.fileName) &&
        (matchMuallimSeerahFile(job.expectedFilename) ||
          isMuallimSeerahShortQuery(job.expectedFilename)))
    if (!sameFile) continue
    if (!isGenericFileRequest(job.requestText)) continue
    await updateTelegramFileJob(job.id, {
      status: 'done',
      lastErrorAr: `merged→${next.id.slice(0, 8)}`,
      telegramFileId: opts.telegramFileId || job.telegramFileId,
    })
  }
  return next ? [next] : []
}

export async function getTelegramFileJob(
  id: string
): Promise<TelegramFileJob | null> {
  const fromMem = mem.get(id)
  if (fromMem) return fromMem
  const sb = getSupabaseAdmin()
  if (!sb) return null
  try {
    const { data } = await sb.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (!data) return null
    const job = rowToJob(data as Record<string, unknown>)
    mem.set(job.id, job)
    return job
  } catch {
    return null
  }
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

/** Structured PDF page-duplicate / empty-page-copy intent. */
export type PdfDuplicateWorkParams =
  | { copyPage: number; afterPage: number; findEmptyPage?: false }
  | { afterPage: number; findEmptyPage: true }

/**
 * Infer structured PDF page-duplicate intent from Arabic/English requests.
 *
 * «صفحة فاضية/فارغة» = copy an existing page with NO writing at all
 * (not “mostly blank”, not بسم الله / headers / title leaves;
 * NOT invent a white blank; NOT default to page 48).
 * «صفحة بيضاء» is handled elsewhere (pdf_insert_blank_page).
 */
export function inferPdfDuplicateWorkParams(
  requestText: string
): PdfDuplicateWorkParams | null {
  const t = requestText.replace(/\s+/g, ' ')

  // Correction / empty-page intent wins over stale «صفحة 48» numbers.
  // «صفحة بيضاء» invent-blank only when clearly requested (not «ليست بيضاء»).
  const asksInventedBlank =
    /(?:أدرج|ادرج|أضف|اضف|ضع|حط|insert)\s+(?:صفحة\s*)?بيضاء|(?:^|[^\u0600-\u06FF])صفحة\s*بيضاء(?!\s*(?:مخترع|من\s*الملف))|blank\s*page|pdf_insert_blank/iu.test(
      t
    ) && !/(?:ليست|مو|ليس|لا|ممنوع|غير)\s*(?:اختراع\s*)?(?:صفحة\s*)?بيضاء/iu.test(t)

  const wantsEmptyFromDoc =
    /صفح[ةه]\s*(?:فاضي[ةه]|فارغ[ةه])|(?:فاضي[ةه]|فارغ[ةه])\s*(?:من\s*)?(?:ال)?(?:كتاب[ةه]|محتوى|نص)?|(?:بدون|بلا)\s*(?:كتاب[ةه]|نص|محتوى)|empty\s*page|content[- ]?less\s*page|findEmptyPage/iu.test(
      t
    ) && !asksInventedBlank

  const afterOnly = t.match(
    /(?:بعد|after)\s*(?:ال)?(?:صفحة|صفحه|page)?\s*(\d{1,4})/i
  )

  if (wantsEmptyFromDoc && afterOnly) {
    return { findEmptyPage: true, afterPage: Number(afterOnly[1]) }
  }

  // «كرر/انسخ صفحة 48 بعد 45» — only when NOT asking for an empty leaf.
  if (!wantsEmptyFromDoc) {
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
      /* try mesh */
    }
  }

  const expected = job.expectedFilename.trim()
  const aliasParams = Array.isArray(job.workParams?.aliases)
    ? (job.workParams.aliases as unknown[]).map((a) => String(a))
    : []
  const queries = [
    expected,
    ...aliasParams,
    ...(isMuallimSeerahShortQuery(expected) || matchMuallimSeerahFile(expected)
      ? [
          'المعلم الاول',
          'المعلم الأول من معالم من السيرة النبوية',
          'المعلم الاول من معالم من السيرة النبوية',
        ]
      : []),
  ].filter((q, i, arr) => q && arr.indexOf(q) === i)

  // Full mesh: TG mirror → room → Drive → Mac (aliases; never biology).
  try {
    const { findAcrossStorageMesh } = await import(
      '@/lib/telegram/storage-mesh'
    )
    for (const q of queries.length ? queries : [expected || 'المعلم الاول']) {
      const mesh = await findAcrossStorageMesh({
        scopeId: job.scopeId,
        chatId: job.chatId,
        queryName: q,
        hydrateBytes: true,
      })
      if (mesh?.vaultFileId) {
        return {
          vaultFileId: mesh.vaultFileId,
          source: mesh.source,
          fileName: mesh.fileName,
        }
      }
    }
  } catch (e) {
    console.warn('[telegram] storage mesh resolve', e)
  }

  // Legacy attachment fallback (name-agnostic latest with bytes)
  const att = await getRecoverableTelegramAttachment(job.chatId)
  if (att?.hasBytes && att.vaultFileId) {
    if (
      !job.expectedFilename ||
      filenamesStrictMatch(att.fileName, job.expectedFilename) ||
      (isMuallimSeerahShortQuery(job.expectedFilename) &&
        matchMuallimSeerahFile(att.fileName))
    ) {
      return {
        vaultFileId: att.vaultFileId,
        source: 'attachment',
        fileName: att.fileName,
      }
    }
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
 * HARD RULE: never spam «أعد إرسال الملف».
 * Keep job in waiting_file silently; cron/mesh/archive will resume when bytes appear.
 * notify is always false — asking to resend is a product failure mode.
 */
export async function shouldNotifyWaitingFileOnce(
  job: TelegramFileJob
): Promise<{ notify: boolean; messageAr?: string }> {
  if (job.notifiedWaitingFile) return { notify: false }
  if (job.vaultFileId) return { notify: false }
  const resolved = await resolveTelegramJobFile(job)
  if (resolved) return { notify: false }
  if (job.telegramFileId) return { notify: false }
  // Silent queue only — do not message the user to resend.
  void telegramFileNeverStoredAr(job.expectedFilename || undefined)
  return { notify: false }
}

export function formatPdfDuplicateToolHintAr(
  dup: PdfDuplicateWorkParams,
  fileId?: string
): string {
  const fid = fileId ? ` fileId=${fileId}` : ''
  if (dup.findEmptyPage) {
    return `استدعِ pdf_duplicate_page: findEmptyPage=true afterPage=${dup.afterPage}${fid} ثم return_file. صفحة فاضية = بلا أي كتابة إطلاقاً (ليست بسم الله/ترويسة/عنوان) — إن لم توجد أبلغ بذلك. ممنوع mode=blank وممنوع افتراض copyPage=48.`
  }
  return `استدعِ pdf_duplicate_page: copyPage=${dup.copyPage} afterPage=${dup.afterPage}${fid} ثم return_file.`
}

export function resolvePdfDuplicateParams(
  job: Pick<TelegramFileJob, 'requestText' | 'workParams'>
): PdfDuplicateWorkParams | null {
  const fromText = inferPdfDuplicateWorkParams(job.requestText)
  if (fromText) return fromText
  const after = Number(job.workParams.afterPage)
  if (!Number.isFinite(after) || after < 1) return null
  if (job.workParams.findEmptyPage === true) {
    return { findEmptyPage: true, afterPage: after }
  }
  const copy = Number(job.workParams.copyPage)
  if (Number.isFinite(copy) && copy >= 1) {
    return { copyPage: copy, afterPage: after }
  }
  return null
}

export function buildResumePromptForJob(
  job: TelegramFileJob,
  resolved: ResolvedJobFile
): string {
  const params = resolvePdfDuplicateParams(job)

  const lines = [
    job.requestText || 'أكمل المهمة المعلّقة على هذا الملف.',
    '',
    `[استئناف مهمة تيليجرام #${job.id.slice(0, 8)}]`,
    `ملف العمل: «${resolved.fileName}» (fileId=${resolved.vaultFileId}, مصدر=${resolved.source}).`,
    'نفّذ على هذا fileId مباشرة ثم return_file كمرفق تيليجرام. ممنوع استبدال بملف آخر بالاسم.',
  ]
  if (params?.findEmptyPage) {
    lines.push(
      `استدعِ pdf_duplicate_page فوراً: findEmptyPage=true afterPage=${params.afterPage} fileId=${resolved.vaultFileId} ثم return_file.`,
      'صفحة فاضية = انسخ صفحة موجودة بلا أي كتابة إطلاقاً من الملف نفسه (ليست بسم الله الرحمن الرحيم ولا ترويسة ولا صفحة عنوان). إن لم توجد صفحة بلا كتابة أبلغ المجموعة صادقاً — ممنوع اختراع صفحة بيضاء (mode=blank). ممنوع copyPage=48 إلا إن طُلب رقم الصفحة صراحة.'
    )
  } else if (params && 'copyPage' in params && params.copyPage != null) {
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
