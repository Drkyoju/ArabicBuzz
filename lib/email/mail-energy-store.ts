/**
 * Personal Gmail Energy-like jobs: snooze wake, schedule send, reminders.
 * Auto-creates table via Prisma raw SQL (same pattern as imap-store).
 */
import { prisma, withPrismaFallback } from '@/lib/db'

export type MailEnergyKind = 'snooze' | 'schedule_send' | 'reminder'

export type MailEnergyJob = {
  id: string
  userId: string
  accountEmail: string | null
  kind: MailEnergyKind
  messageId: string | null
  subject: string | null
  payload: Record<string, unknown>
  dueAt: Date
  status: 'pending' | 'done' | 'cancelled' | 'failed'
  lastErrorAr: string | null
  createdAt: Date
}

let ensured = false

async function ensureTable() {
  if (ensured) return
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS mail_energy_jobs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          account_email TEXT,
          kind TEXT NOT NULL,
          message_id TEXT,
          subject TEXT,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          due_at TIMESTAMPTZ NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          last_error_ar TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS mail_energy_jobs_due_idx
          ON mail_energy_jobs (status, due_at);
        CREATE INDEX IF NOT EXISTS mail_energy_jobs_user_idx
          ON mail_energy_jobs (user_id, status);
      `),
    null
  )
  ensured = true
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `mej-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function mapRow(r: Record<string, unknown>): MailEnergyJob {
  const payload =
    typeof r.payload === 'object' && r.payload
      ? (r.payload as Record<string, unknown>)
      : typeof r.payload === 'string'
        ? (JSON.parse(r.payload) as Record<string, unknown>)
        : {}
  return {
    id: String(r.id),
    userId: String(r.user_id),
    accountEmail: r.account_email ? String(r.account_email) : null,
    kind: String(r.kind) as MailEnergyKind,
    messageId: r.message_id ? String(r.message_id) : null,
    subject: r.subject ? String(r.subject) : null,
    payload,
    dueAt: new Date(String(r.due_at)),
    status: String(r.status) as MailEnergyJob['status'],
    lastErrorAr: r.last_error_ar ? String(r.last_error_ar) : null,
    createdAt: new Date(String(r.created_at)),
  }
}

export async function insertMailEnergyJob(opts: {
  userId: string
  accountEmail?: string | null
  kind: MailEnergyKind
  messageId?: string | null
  subject?: string | null
  payload?: Record<string, unknown>
  dueAt: Date
}): Promise<MailEnergyJob> {
  await ensureTable()
  const id = newId()
  const payload = JSON.stringify(opts.payload || {})
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `INSERT INTO mail_energy_jobs
          (id, user_id, account_email, kind, message_id, subject, payload, due_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'pending')`,
        id,
        opts.userId,
        opts.accountEmail || null,
        opts.kind,
        opts.messageId || null,
        opts.subject || null,
        payload,
        opts.dueAt.toISOString()
      ),
    null
  )
  return {
    id,
    userId: opts.userId,
    accountEmail: opts.accountEmail || null,
    kind: opts.kind,
    messageId: opts.messageId || null,
    subject: opts.subject || null,
    payload: opts.payload || {},
    dueAt: opts.dueAt,
    status: 'pending',
    lastErrorAr: null,
    createdAt: new Date(),
  }
}

export async function listPendingMailEnergyForUser(
  userId: string
): Promise<MailEnergyJob[]> {
  await ensureTable()
  const rows = await withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM mail_energy_jobs
         WHERE user_id = $1 AND status = 'pending'
         ORDER BY due_at ASC
         LIMIT 50`,
        userId
      ),
    [] as Array<Record<string, unknown>>
  )
  return (rows || []).map(mapRow)
}

export async function listDueMailEnergyJobs(
  now = new Date(),
  limit = 40
): Promise<MailEnergyJob[]> {
  await ensureTable()
  const rows = await withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM mail_energy_jobs
         WHERE status = 'pending' AND due_at <= $1
         ORDER BY due_at ASC
         LIMIT $2`,
        now.toISOString(),
        limit
      ),
    [] as Array<Record<string, unknown>>
  )
  return (rows || []).map(mapRow)
}

export async function markMailEnergyDone(id: string) {
  await ensureTable()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `UPDATE mail_energy_jobs
         SET status = 'done', updated_at = NOW(), last_error_ar = NULL
         WHERE id = $1`,
        id
      ),
    null
  )
}

export async function markMailEnergyFailed(id: string, errorAr: string) {
  await ensureTable()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `UPDATE mail_energy_jobs
         SET status = 'failed', updated_at = NOW(), last_error_ar = $2
         WHERE id = $1`,
        id,
        errorAr.slice(0, 500)
      ),
    null
  )
}

export async function cancelMailEnergyJob(id: string, userId: string) {
  await ensureTable()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `UPDATE mail_energy_jobs
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
        id,
        userId
      ),
    null
  )
}
