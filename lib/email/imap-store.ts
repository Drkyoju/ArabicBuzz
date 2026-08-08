import { prisma, withPrismaFallback } from '@/lib/db'
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/email/crypto'

export type ImapMailboxRow = {
  id: string
  label_ar: string
  email_address: string
  imap_host: string
  imap_port: number
  imap_secure: boolean
  smtp_host: string
  smtp_port: number
  smtp_secure: boolean
  username: string
  password_enc: string
  enabled: boolean
  notify_telegram: boolean
  last_uid: string | number | bigint
  last_uid_sent: string | number | bigint
  last_sync_at: Date | string | null
  last_error_ar: string | null
  created_by: string
  created_at: Date | string
  updated_at: Date | string
}

export type MailIntelCache = {
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

export type ImapMessageRow = {
  id: string
  mailbox_id: string
  uid: string | number | bigint
  message_id: string | null
  in_reply_to: string | null
  references_hdr: string | null
  folder: string
  subject: string
  from_addr: string
  to_addr: string
  cc_addr: string
  date_at: Date | string | null
  snippet: string
  body_text: string
  body_html: string | null
  seen: boolean
  answered: boolean
  notified: boolean
  raw_size: number | null
  attachments_json?: unknown
  intel_json?: unknown
  created_at: Date | string
  updated_at: Date | string
}

export type ImapMailboxPublic = {
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
  lastUid: number
  lastUidSent: number
  lastSyncAt: string | null
  lastErrorAr: string | null
  configured: boolean
}

export type ImapMailboxCreds = {
  id: string
  emailAddress: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  username: string
  password: string
  notifyTelegram: boolean
  lastUid: number
  lastUidSent: number
}

async function ensureTables(): Promise<void> {
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS imap_mailboxes (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          label_ar TEXT NOT NULL DEFAULT 'بريد الجمعية',
          email_address TEXT NOT NULL,
          imap_host TEXT NOT NULL,
          imap_port INT NOT NULL DEFAULT 993,
          imap_secure BOOLEAN NOT NULL DEFAULT true,
          smtp_host TEXT NOT NULL,
          smtp_port INT NOT NULL DEFAULT 465,
          smtp_secure BOOLEAN NOT NULL DEFAULT true,
          username TEXT NOT NULL,
          password_enc TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT true,
          notify_telegram BOOLEAN NOT NULL DEFAULT true,
          last_uid BIGINT NOT NULL DEFAULT 0,
          last_sync_at TIMESTAMPTZ,
          last_error_ar TEXT,
          created_by TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `),
    0
  )
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS imap_messages (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          mailbox_id TEXT NOT NULL REFERENCES imap_mailboxes(id) ON DELETE CASCADE,
          uid BIGINT NOT NULL,
          message_id TEXT,
          in_reply_to TEXT,
          references_hdr TEXT,
          folder TEXT NOT NULL DEFAULT 'INBOX',
          subject TEXT NOT NULL DEFAULT '',
          from_addr TEXT NOT NULL DEFAULT '',
          to_addr TEXT NOT NULL DEFAULT '',
          cc_addr TEXT NOT NULL DEFAULT '',
          date_at TIMESTAMPTZ,
          snippet TEXT NOT NULL DEFAULT '',
          body_text TEXT NOT NULL DEFAULT '',
          body_html TEXT,
          seen BOOLEAN NOT NULL DEFAULT false,
          answered BOOLEAN NOT NULL DEFAULT false,
          notified BOOLEAN NOT NULL DEFAULT false,
          raw_size INT,
          attachments_json JSONB,
          intel_json JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (mailbox_id, folder, uid)
        )
      `),
    0
  )
  // Existing DBs created before mail-intel — add columns safely.
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(`
        ALTER TABLE imap_messages
          ADD COLUMN IF NOT EXISTS attachments_json JSONB,
          ADD COLUMN IF NOT EXISTS intel_json JSONB
      `),
    0
  )
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(`
        ALTER TABLE imap_mailboxes
          ADD COLUMN IF NOT EXISTS last_uid_sent BIGINT NOT NULL DEFAULT 0
      `),
    0
  )
}

function toPublic(row: ImapMailboxRow): ImapMailboxPublic {
  const password = decryptSecret(row.password_enc)
  return {
    id: row.id,
    labelAr: row.label_ar,
    emailAddress: row.email_address,
    imapHost: row.imap_host,
    imapPort: Number(row.imap_port),
    imapSecure: Boolean(row.imap_secure),
    smtpHost: row.smtp_host,
    smtpPort: Number(row.smtp_port),
    smtpSecure: Boolean(row.smtp_secure),
    username: row.username,
    passwordHint: password ? maskSecret(password) : null,
    hasPassword: Boolean(password),
    enabled: Boolean(row.enabled),
    notifyTelegram: Boolean(row.notify_telegram),
    lastUid: Number(row.last_uid || 0),
    lastUidSent: Number(
      (row as ImapMailboxRow & { last_uid_sent?: string | number | bigint })
        .last_uid_sent || 0
    ),
    lastSyncAt: row.last_sync_at
      ? new Date(row.last_sync_at).toISOString()
      : null,
    lastErrorAr: row.last_error_ar,
    configured: Boolean(password && row.imap_host && row.smtp_host),
  }
}

export async function getPrimaryMailbox(): Promise<ImapMailboxRow | null> {
  await ensureTables()
  const rows = await withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<ImapMailboxRow[]>(
        `SELECT * FROM imap_mailboxes
         WHERE enabled = true
         ORDER BY updated_at DESC
         LIMIT 1`
      ),
    [] as ImapMailboxRow[]
  )
  return rows[0] || null
}

export async function getMailboxPublic(): Promise<ImapMailboxPublic | null> {
  const row = await getPrimaryMailbox()
  return row ? toPublic(row) : null
}

export async function isImapConfigured(): Promise<boolean> {
  const row = await getPrimaryMailbox()
  if (!row) return false
  return Boolean(decryptSecret(row.password_enc))
}

export async function getMailboxCreds(): Promise<ImapMailboxCreds | null> {
  const row = await getPrimaryMailbox()
  if (!row) return null
  const password = decryptSecret(row.password_enc)
  if (!password) return null
  return {
    id: row.id,
    emailAddress: row.email_address,
    imapHost: row.imap_host,
    imapPort: Number(row.imap_port),
    imapSecure: Boolean(row.imap_secure),
    smtpHost: row.smtp_host,
    smtpPort: Number(row.smtp_port),
    smtpSecure: Boolean(row.smtp_secure),
    username: row.username,
    password,
    notifyTelegram: Boolean(row.notify_telegram),
    lastUid: Number(row.last_uid || 0),
    lastUidSent: Number(
      (row as ImapMailboxRow & { last_uid_sent?: string | number | bigint })
        .last_uid_sent || 0
    ),
  }
}

export type UpsertMailboxInput = {
  labelAr?: string
  emailAddress: string
  imapHost: string
  imapPort?: number
  imapSecure?: boolean
  smtpHost: string
  smtpPort?: number
  smtpSecure?: boolean
  username: string
  /** Omit / empty to keep existing password. */
  password?: string
  enabled?: boolean
  notifyTelegram?: boolean
  createdBy?: string
}

export async function upsertMailbox(
  input: UpsertMailboxInput
): Promise<ImapMailboxPublic> {
  await ensureTables()
  const email = input.emailAddress.trim().toLowerCase()
  if (!email.includes('@')) throw new Error('عنوان البريد غير صالح.')
  const imapHost = input.imapHost.trim()
  const smtpHost = input.smtpHost.trim()
  if (!imapHost || !smtpHost) {
    throw new Error('يلزم مضيف IMAP ومضيف SMTP.')
  }
  const username = (input.username || email).trim()
  const existing = await getPrimaryMailbox()

  let passwordEnc = existing?.password_enc || ''
  if (input.password?.trim()) {
    passwordEnc = encryptSecret(input.password.trim())
  }
  if (!passwordEnc) {
    throw new Error('يلزم كلمة مرور أو App Password لأول ربط.')
  }

  const labelAr = (input.labelAr || 'بريد الجمعية').trim()
  const imapPort = input.imapPort ?? 993
  const smtpPort = input.smtpPort ?? 465
  const imapSecure = input.imapSecure ?? true
  const smtpSecure = input.smtpSecure ?? true
  const enabled = input.enabled ?? true
  const notifyTelegram = input.notifyTelegram ?? true
  const createdBy = input.createdBy || ''

  if (existing) {
    await withPrismaFallback(
      () =>
        prisma.$executeRawUnsafe(
          `UPDATE imap_mailboxes SET
            label_ar = $1,
            email_address = $2,
            imap_host = $3,
            imap_port = $4,
            imap_secure = $5,
            smtp_host = $6,
            smtp_port = $7,
            smtp_secure = $8,
            username = $9,
            password_enc = $10,
            enabled = $11,
            notify_telegram = $12,
            last_error_ar = NULL,
            updated_at = NOW()
           WHERE id = $13`,
          labelAr,
          email,
          imapHost,
          imapPort,
          imapSecure,
          smtpHost,
          smtpPort,
          smtpSecure,
          username,
          passwordEnc,
          enabled,
          notifyTelegram,
          existing.id
        ),
      0
    )
  } else {
    await withPrismaFallback(
      () =>
        prisma.$executeRawUnsafe(
          `INSERT INTO imap_mailboxes (
            label_ar, email_address, imap_host, imap_port, imap_secure,
            smtp_host, smtp_port, smtp_secure, username, password_enc,
            enabled, notify_telegram, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          labelAr,
          email,
          imapHost,
          imapPort,
          imapSecure,
          smtpHost,
          smtpPort,
          smtpSecure,
          username,
          passwordEnc,
          enabled,
          notifyTelegram,
          createdBy
        ),
      0
    )
  }

  const pub = await getMailboxPublic()
  if (!pub) throw new Error('تعذّر حفظ إعدادات البريد.')
  return pub
}

export async function deleteMailbox(): Promise<void> {
  await ensureTables()
  await withPrismaFallback(
    () => prisma.$executeRawUnsafe(`DELETE FROM imap_mailboxes`),
    0
  )
}

export async function markSyncResult(opts: {
  mailboxId: string
  lastUid?: number
  lastUidSent?: number
  errorAr?: string | null
}): Promise<void> {
  await ensureTables()
  if (opts.errorAr) {
    await withPrismaFallback(
      () =>
        prisma.$executeRawUnsafe(
          `UPDATE imap_mailboxes SET last_error_ar = $1, last_sync_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          opts.errorAr,
          opts.mailboxId
        ),
      0
    )
    return
  }
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `UPDATE imap_mailboxes SET
           last_uid = GREATEST(last_uid, $1::bigint),
           last_uid_sent = GREATEST(COALESCE(last_uid_sent, 0), $2::bigint),
           last_sync_at = NOW(),
           last_error_ar = NULL,
           updated_at = NOW()
         WHERE id = $3`,
        opts.lastUid ?? 0,
        opts.lastUidSent ?? 0,
        opts.mailboxId
      ),
    0
  )
}

export type UpsertMessageInput = {
  mailboxId: string
  uid: number
  messageId?: string | null
  inReplyTo?: string | null
  referencesHdr?: string | null
  folder?: string
  subject: string
  fromAddr: string
  toAddr: string
  ccAddr?: string
  dateAt?: Date | null
  snippet: string
  bodyText: string
  bodyHtml?: string | null
  seen: boolean
  answered?: boolean
  rawSize?: number | null
  attachmentsJson?: unknown
}

export async function upsertMessage(
  input: UpsertMessageInput
): Promise<{ id: string; isNew: boolean }> {
  await ensureTables()
  const folder = input.folder || 'INBOX'
  const existing = await withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM imap_messages
         WHERE mailbox_id = $1 AND folder = $2 AND uid = $3
         LIMIT 1`,
        input.mailboxId,
        folder,
        input.uid
      ),
    [] as Array<{ id: string }>
  )
  const attachmentsJson =
    input.attachmentsJson !== undefined
      ? JSON.stringify(input.attachmentsJson)
      : null

  if (existing[0]) {
    await withPrismaFallback(
      () =>
        prisma.$executeRawUnsafe(
          `UPDATE imap_messages SET
            message_id = $1, in_reply_to = $2, references_hdr = $3,
            subject = $4, from_addr = $5, to_addr = $6, cc_addr = $7,
            date_at = $8, snippet = $9, body_text = $10, body_html = $11,
            seen = $12, answered = $13, raw_size = $14,
            attachments_json = COALESCE($15::jsonb, attachments_json),
            updated_at = NOW()
           WHERE id = $16`,
          input.messageId || null,
          input.inReplyTo || null,
          input.referencesHdr || null,
          input.subject,
          input.fromAddr,
          input.toAddr,
          input.ccAddr || '',
          input.dateAt || null,
          input.snippet,
          input.bodyText,
          input.bodyHtml || null,
          input.seen,
          input.answered ?? false,
          input.rawSize ?? null,
          attachmentsJson,
          existing[0].id
        ),
      0
    )
    return { id: existing[0].id, isNew: false }
  }

  const id = `imsg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `INSERT INTO imap_messages (
          id, mailbox_id, uid, message_id, in_reply_to, references_hdr, folder,
          subject, from_addr, to_addr, cc_addr, date_at, snippet, body_text, body_html,
          seen, answered, raw_size, attachments_json
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb
        )`,
        id,
        input.mailboxId,
        input.uid,
        input.messageId || null,
        input.inReplyTo || null,
        input.referencesHdr || null,
        folder,
        input.subject,
        input.fromAddr,
        input.toAddr,
        input.ccAddr || '',
        input.dateAt || null,
        input.snippet,
        input.bodyText,
        input.bodyHtml || null,
        input.seen,
        input.answered ?? false,
        input.rawSize ?? null,
        attachmentsJson
      ),
    0
  )
  return { id, isNew: true }
}

export type MailFolderFilter = 'all' | 'INBOX' | 'Sent'

function folderSqlPredicate(folder: MailFolderFilter | undefined): {
  clause: string
  /** $n placeholder already embedded as literal-safe param index handled by caller */
  value: string
} {
  const f = folder || 'INBOX'
  if (f === 'all') return { clause: 'TRUE', value: '' }
  if (f === 'Sent') {
    return {
      clause: `(folder = 'Sent' OR folder ILIKE '%sent%' OR folder ILIKE '%مرسل%')`,
      value: '',
    }
  }
  return { clause: `folder = 'INBOX'`, value: '' }
}

export async function listMessages(opts?: {
  unreadOnly?: boolean
  query?: string
  limit?: number
  /** Default INBOX so Sent does not clutter الوارد. Use 'all' for corpus search. */
  folder?: MailFolderFilter
}): Promise<ImapMessageRow[]> {
  await ensureTables()
  const limit = Math.min(Math.max(opts?.limit || 30, 1), 100)
  const q = (opts?.query || '').trim()
  const unread = Boolean(opts?.unreadOnly)
  const folder = opts?.folder ?? 'INBOX'
  const folderPred = folderSqlPredicate(folder)

  if (q) {
    const like = `%${q.replace(/%/g, '')}%`
    return withPrismaFallback(
      () =>
        prisma.$queryRawUnsafe<ImapMessageRow[]>(
          `SELECT * FROM imap_messages
           WHERE ($1::boolean = false OR seen = false)
             AND (${folderPred.clause})
             AND (
               subject ILIKE $2 OR from_addr ILIKE $2 OR to_addr ILIKE $2
               OR cc_addr ILIKE $2 OR snippet ILIKE $2 OR body_text ILIKE $2
               OR COALESCE(attachments_json::text, '') ILIKE $2
               OR COALESCE(intel_json::text, '') ILIKE $2
             )
           ORDER BY date_at DESC NULLS LAST
           LIMIT $3`,
          unread,
          like,
          limit
        ),
      [] as ImapMessageRow[]
    )
  }

  return withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<ImapMessageRow[]>(
        `SELECT * FROM imap_messages
         WHERE ($1::boolean = false OR seen = false)
           AND (${folderPred.clause})
         ORDER BY date_at DESC NULLS LAST
         LIMIT $2`,
        unread,
        limit
      ),
    [] as ImapMessageRow[]
  )
}

/** Full-corpus mail search: inbox + sent + attachment extracted text. */
export async function searchMailMessages(opts: {
  query: string
  limit?: number
  folder?: MailFolderFilter
}): Promise<ImapMessageRow[]> {
  const q = opts.query.trim()
  if (!q) return []
  return listMessages({
    query: q,
    limit: opts.limit ?? 40,
    folder: opts.folder ?? 'all',
  })
}

export async function getMessageById(
  id: string
): Promise<ImapMessageRow | null> {
  await ensureTables()
  const rows = await withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<ImapMessageRow[]>(
        `SELECT * FROM imap_messages WHERE id = $1 LIMIT 1`,
        id
      ),
    [] as ImapMessageRow[]
  )
  return rows[0] || null
}

export async function countUnread(): Promise<number> {
  await ensureTables()
  const rows = await withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<Array<{ c: string | number }>>(
        `SELECT COUNT(*)::int AS c FROM imap_messages
         WHERE seen = false AND folder = 'INBOX'`
      ),
    [] as Array<{ c: string | number }>
  )
  return Number(rows[0]?.c || 0)
}

export async function listUnnotified(limit = 10): Promise<ImapMessageRow[]> {
  await ensureTables()
  return withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<ImapMessageRow[]>(
        `SELECT * FROM imap_messages
         WHERE notified = false AND folder = 'INBOX'
         ORDER BY date_at DESC NULLS LAST
         LIMIT $1`,
        Math.min(Math.max(limit, 1), 25)
      ),
    [] as ImapMessageRow[]
  )
}

export async function markNotified(ids: string[]): Promise<void> {
  if (!ids.length) return
  await ensureTables()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `UPDATE imap_messages SET notified = true, updated_at = NOW()
         WHERE id = ANY($1::text[])`,
        ids
      ),
    0
  )
}

export async function markSeen(id: string, seen = true): Promise<void> {
  await ensureTables()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `UPDATE imap_messages SET seen = $1, updated_at = NOW() WHERE id = $2`,
        seen,
        id
      ),
    0
  )
}

export async function markAnswered(id: string, answered = true): Promise<void> {
  await ensureTables()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `UPDATE imap_messages SET answered = $1, seen = true, updated_at = NOW() WHERE id = $2`,
        answered,
        id
      ),
    0
  )
}

export async function updateMessageIntel(
  id: string,
  intel: MailIntelCache
): Promise<void> {
  await ensureTables()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `UPDATE imap_messages SET intel_json = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        JSON.stringify(intel),
        id
      ),
    0
  )
}

export async function updateMessageAttachments(
  id: string,
  attachments: unknown
): Promise<void> {
  await ensureTables()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `UPDATE imap_messages SET attachments_json = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        JSON.stringify(attachments),
        id
      ),
    0
  )
}
