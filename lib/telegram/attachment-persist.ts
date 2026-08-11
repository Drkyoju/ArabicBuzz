/**
 * Durable Telegram attachment mirror (DB + memory).
 * Every document/photo/video is recorded immediately — with vault bytes when
 * download succeeds, or metadata-only when Telegram download fails (>20MB).
 */
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import {
  rememberTelegramMedia,
  type RecentTelegramMedia,
} from '@/lib/telegram/recent-media'

export type PersistedTelegramAttachment = {
  id: string
  chatId: string
  scopeId: string
  telegramFileId?: string
  fileUniqueId?: string
  messageId?: string
  fileName: string
  mimeType: string
  sizeBytes?: number
  vaultFileId?: string
  hasBytes: boolean
  downloadErrorAr?: string
  createdAt: string
  updatedAt: string
}

const TABLE = 'telegram_attachments'
const memByChat = new Map<string, PersistedTelegramAttachment[]>()
const MAX_PER_CHAT = 24

function pruneMem(chatId: string) {
  const list = memByChat.get(chatId) || []
  if (list.length > MAX_PER_CHAT) {
    memByChat.set(chatId, list.slice(0, MAX_PER_CHAT))
  }
}

function rowToAtt(r: Record<string, unknown>): PersistedTelegramAttachment {
  return {
    id: String(r.id),
    chatId: String(r.chat_id),
    scopeId: String(r.scope_id),
    telegramFileId: r.telegram_file_id
      ? String(r.telegram_file_id)
      : undefined,
    fileUniqueId: r.file_unique_id ? String(r.file_unique_id) : undefined,
    messageId: r.message_id != null ? String(r.message_id) : undefined,
    fileName: String(r.file_name || ''),
    mimeType: String(r.mime_type || 'application/octet-stream'),
    sizeBytes:
      r.size_bytes != null && Number.isFinite(Number(r.size_bytes))
        ? Number(r.size_bytes)
        : undefined,
    vaultFileId: r.vault_file_id ? String(r.vault_file_id) : undefined,
    hasBytes: Boolean(r.has_bytes),
    downloadErrorAr: r.download_error_ar
      ? String(r.download_error_ar)
      : undefined,
    createdAt: String(r.created_at || new Date().toISOString()),
    updatedAt: String(r.updated_at || new Date().toISOString()),
  }
}

function attToRow(a: PersistedTelegramAttachment): Record<string, unknown> {
  return {
    id: a.id,
    chat_id: a.chatId,
    scope_id: a.scopeId,
    telegram_file_id: a.telegramFileId || null,
    file_unique_id: a.fileUniqueId || null,
    message_id: a.messageId || null,
    file_name: a.fileName,
    mime_type: a.mimeType,
    size_bytes: a.sizeBytes ?? null,
    vault_file_id: a.vaultFileId || null,
    has_bytes: a.hasBytes,
    download_error_ar: a.downloadErrorAr || null,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  }
}

function rememberMem(a: PersistedTelegramAttachment) {
  const list = memByChat.get(a.chatId) || []
  const next = [a, ...list.filter((x) => x.id !== a.id)].slice(0, MAX_PER_CHAT)
  memByChat.set(a.chatId, next)
}

/**
 * Persist attachment metadata (+ vault id when bytes saved).
 * Always call on receive — even when download fails.
 */
export async function persistTelegramAttachment(opts: {
  chatId: string
  scopeId: string
  telegramFileId?: string
  fileUniqueId?: string
  messageId?: string | number
  fileName: string
  mimeType?: string
  sizeBytes?: number
  vaultFileId?: string
  hasBytes?: boolean
  downloadErrorAr?: string
}): Promise<PersistedTelegramAttachment> {
  const now = new Date().toISOString()
  const att: PersistedTelegramAttachment = {
    id: randomUUID(),
    chatId: opts.chatId,
    scopeId: opts.scopeId,
    telegramFileId: opts.telegramFileId,
    fileUniqueId: opts.fileUniqueId,
    messageId:
      opts.messageId != null ? String(opts.messageId) : undefined,
    fileName: opts.fileName || 'telegram-file',
    mimeType: opts.mimeType || 'application/octet-stream',
    sizeBytes: opts.sizeBytes,
    vaultFileId: opts.vaultFileId,
    hasBytes: Boolean(opts.hasBytes && opts.vaultFileId),
    downloadErrorAr: opts.downloadErrorAr,
    createdAt: now,
    updatedAt: now,
  }

  rememberMem(att)

  if (att.hasBytes && att.vaultFileId) {
    rememberTelegramMedia(opts.chatId, {
      fileId: att.vaultFileId,
      name: att.fileName,
      mimeType: att.mimeType,
      scopeId: att.scopeId,
      telegramFileId: att.telegramFileId,
      messageId: att.messageId,
      fileUniqueId: att.fileUniqueId,
      attachmentPersistId: att.id,
    })
  }

  const sb = getSupabaseAdmin()
  if (sb) {
    try {
      const { error } = await sb.from(TABLE).upsert(attToRow(att) as never)
      if (error) console.error('[telegram] attachment persist', error.message)
    } catch (e) {
      console.error('[telegram] attachment persist', e)
    }
  }

  return att
}

/** Patch vault bytes onto an existing metadata-only row (recovery download). */
export async function attachVaultBytesToPersisted(opts: {
  attachmentId: string
  vaultFileId: string
  fileName?: string
}): Promise<PersistedTelegramAttachment | null> {
  const now = new Date().toISOString()
  let found: PersistedTelegramAttachment | null = null
  for (const list of memByChat.values()) {
    const hit = list.find((a) => a.id === opts.attachmentId)
    if (hit) {
      hit.vaultFileId = opts.vaultFileId
      hit.hasBytes = true
      hit.downloadErrorAr = undefined
      if (opts.fileName) hit.fileName = opts.fileName
      hit.updatedAt = now
      found = hit
      rememberTelegramMedia(hit.chatId, {
        fileId: opts.vaultFileId,
        name: hit.fileName,
        mimeType: hit.mimeType,
        scopeId: hit.scopeId,
        telegramFileId: hit.telegramFileId,
        messageId: hit.messageId,
        fileUniqueId: hit.fileUniqueId,
        attachmentPersistId: hit.id,
      })
      break
    }
  }

  const sb = getSupabaseAdmin()
  if (sb) {
    try {
      const { data, error } = await sb
        .from(TABLE)
        .update({
          vault_file_id: opts.vaultFileId,
          has_bytes: true,
          download_error_ar: null,
          ...(opts.fileName ? { file_name: opts.fileName } : {}),
          updated_at: now,
        } as never)
        .eq('id', opts.attachmentId)
        .select('*')
        .maybeSingle()
      if (!error && data) found = rowToAtt(data as Record<string, unknown>)
    } catch (e) {
      console.error('[telegram] attach vault bytes', e)
    }
  }
  return found
}

export async function listPersistedTelegramAttachments(
  chatId: string,
  limit = 8
): Promise<PersistedTelegramAttachment[]> {
  const mem = (memByChat.get(chatId) || []).slice(0, limit)
  const sb = getSupabaseAdmin()
  if (!sb) return mem
  try {
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, limit))
    if (error || !data?.length) return mem
    const rows = (data as Record<string, unknown>[]).map(rowToAtt)
    for (const r of rows) rememberMem(r)
    pruneMem(chatId)
    return rows
  } catch {
    return mem
  }
}

export async function getLatestPersistedAttachment(
  chatId: string
): Promise<PersistedTelegramAttachment | null> {
  const list = await listPersistedTelegramAttachments(chatId, 1)
  return list[0] || null
}

/** Prefer attachment with vault bytes; else latest with live telegram_file_id. */
export async function getRecoverableTelegramAttachment(
  chatId: string
): Promise<PersistedTelegramAttachment | null> {
  const list = await listPersistedTelegramAttachments(chatId, 12)
  const withBytes = list.find((a) => a.hasBytes && a.vaultFileId)
  if (withBytes) return withBytes
  return list.find((a) => Boolean(a.telegramFileId)) || list[0] || null
}

export function persistedToRecentMedia(
  a: PersistedTelegramAttachment
): RecentTelegramMedia | null {
  if (!a.vaultFileId) return null
  return {
    fileId: a.vaultFileId,
    name: a.fileName,
    mimeType: a.mimeType,
    scopeId: a.scopeId,
    telegramFileId: a.telegramFileId,
    messageId: a.messageId,
    fileUniqueId: a.fileUniqueId,
    attachmentPersistId: a.id,
    at: Date.parse(a.createdAt) || Date.now(),
  }
}

/** Hydrate in-memory recent-media from durable rows (cold start / new instance). */
export async function hydrateRecentMediaFromPersist(
  chatId: string
): Promise<void> {
  const list = await listPersistedTelegramAttachments(chatId, 8)
  for (const a of [...list].reverse()) {
    const m = persistedToRecentMedia(a)
    if (m) {
      rememberTelegramMedia(chatId, m)
    }
  }
}

export function clearTelegramAttachmentPersistForTests(): void {
  memByChat.clear()
}

/**
 * ONE honest Arabic line when literally no bytes and getFile dead —
 * never spam; used only after exhausting recovery.
 */
export function telegramFileNeverStoredAr(expectedFilename?: string): string {
  const name = expectedFilename?.trim()
    ? `«${expectedFilename.trim()}»`
    : 'الملف'
  return [
    `${name} غير متوفر حالياً في مرآة تيليجرام / الغرفة / Drive / الماك.`,
    'المهمة في انتظار — سأعيد المحاولة تلقائياً عند توفر البايتات أو عودة الجسر.',
    'إن أمكن: أرسل ملفاً أصغر، أو ارفعه عبر Drive/الغرفة، أو أعد المحاولة لاحقاً.',
    'ممنوع استبدال الملف بدليل أحياء أو أي مستند بالتشابه في الاسم.',
  ].join('\n')
}

export function telegramLargeFileWorkingPathAr(opts: {
  fileName?: string
  sizeBytes?: number
}): string {
  const name = opts.fileName ? `«${opts.fileName}»` : 'المرفق'
  const sizeMb =
    opts.sizeBytes != null
      ? ` (≈${(opts.sizeBytes / (1024 * 1024)).toFixed(1)} م.ب)`
      : ''
  return [
    `بانتظار الملف الكبير ${name}${sizeMb} — المهمة في طابور (مرة واحدة، بلا إلغاء).`,
    'أتابع تلقائياً: Local Bot API → جسر الماك → MTProto عند الحاجة، ثم خزنة الغرفة أو Drive بنفس الاسم.',
    'إن كان الجسر متوقفاً (نوم الجهاز / نفق مقطوع): انتظر أو أعد المحاولة لاحقاً، أو أرسل ملفاً أصغر إن أمكن.',
    'عند توفر البايتات أكمل وأرسل الناتج هنا. لا حاجة لإعادة إرسال الملف مراراً بلا سياق.',
  ].join('\n')
}
