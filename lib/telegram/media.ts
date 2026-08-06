import { InputFile, type Context } from 'grammy'
import { readWorkspaceFile, saveWorkspaceFile } from '@/lib/documents/workspace'

export type TelegramAttachmentRef = {
  fileId: string
  name: string
  mimeType?: string
  scopeId: string
}

/** Skip emoji-only / sticker-like chatter so the bot does not spam the group. */
export function isTrivialGroupMessage(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (t.length <= 2) return true
  // Pure emoji / symbols (no Arabic/Latin letters or digits)
  const withoutEmoji = t
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
  if (!withoutEmoji) return true
  // Common short reactions
  if (/^(👍|👎|😂|🤣|❤️|❤|🙏|🔥|✅|❌|ok|نعم|لا|هههه+|هه+)$/iu.test(t)) {
    return true
  }
  return false
}

export function extractAttachmentsFromToolOutput(
  out: unknown,
  fallbackScopeId: string
): TelegramAttachmentRef[] {
  if (!out || typeof out !== 'object') return []
  const o = out as Record<string, unknown>
  const found: TelegramAttachmentRef[] = []
  const push = (raw: Record<string, unknown>) => {
    const fileId = String(raw.fileId || raw.id || '').trim()
    const name = String(raw.name || raw.originalName || raw.filename || '').trim()
    if (!fileId || !name) return
    found.push({
      fileId,
      name,
      mimeType: raw.mimeType ? String(raw.mimeType) : undefined,
      scopeId: String(raw.scopeId || fallbackScopeId),
    })
  }
  if (Array.isArray(o.attachments)) {
    for (const a of o.attachments) {
      if (a && typeof a === 'object') push(a as Record<string, unknown>)
    }
  }
  if (o.fileId && (o.name || o.originalName || o.downloadPath)) {
    push(o)
  }
  return found
}

export async function downloadTelegramFileBuffer(
  ctx: Context,
  fileId: string
): Promise<{ buffer: Buffer; filePath: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')
  const file = await ctx.api.getFile(fileId)
  if (!file.file_path) throw new Error('مسار ملف تيليجرام غير متوفر')
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`تعذّر تنزيل الملف من تيليجرام (${res.status})`)
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    filePath: file.file_path,
  }
}

export async function ingestTelegramDocumentToWorkspace(opts: {
  ctx: Context
  scopeId: string
  fileId: string
  fileName: string
  mimeType?: string
}): Promise<{ fileId: string; name: string; mimeType: string }> {
  const { buffer, filePath } = await downloadTelegramFileBuffer(
    opts.ctx,
    opts.fileId
  )
  const ext = filePath.includes('.')
    ? filePath.slice(filePath.lastIndexOf('.'))
    : ''
  const originalName =
    opts.fileName ||
    `telegram-${Date.now()}${ext || '.bin'}`
  const mime =
    opts.mimeType ||
    guessMime(originalName) ||
    'application/octet-stream'
  const saved = await saveWorkspaceFile({
    scopeId: opts.scopeId,
    buffer,
    originalName,
    mimeType: mime,
  })
  return {
    fileId: saved.file.id,
    name: saved.file.originalName,
    mimeType: saved.file.mimeType,
  }
}

export async function ingestTelegramPhotoToWorkspace(opts: {
  ctx: Context
  scopeId: string
  /** Largest photo size file_id */
  fileId: string
}): Promise<{ fileId: string; name: string; mimeType: string }> {
  const { buffer } = await downloadTelegramFileBuffer(opts.ctx, opts.fileId)
  const originalName = `telegram-photo-${Date.now()}.jpg`
  const saved = await saveWorkspaceFile({
    scopeId: opts.scopeId,
    buffer,
    originalName,
    mimeType: 'image/jpeg',
  })
  return {
    fileId: saved.file.id,
    name: saved.file.originalName,
    mimeType: saved.file.mimeType,
  }
}

export async function sendAttachmentsToTelegramChat(opts: {
  ctx: Context
  attachments: TelegramAttachmentRef[]
  captionAr?: string
}): Promise<string[]> {
  const sent: string[] = []
  const seen = new Set<string>()
  for (const a of opts.attachments.slice(0, 6)) {
    if (seen.has(a.fileId)) continue
    seen.add(a.fileId)
    try {
      const file = await readWorkspaceFile(a.scopeId, a.fileId)
      await opts.ctx.replyWithDocument(
        new InputFile(file.buffer, file.meta.originalName || a.name),
        {
          caption: (opts.captionAr || `📎 ${file.meta.originalName}`).slice(
            0,
            1000
          ),
        }
      )
      sent.push(file.meta.originalName)
    } catch (e) {
      console.error('[telegram] send attachment', a.fileId, e)
    }
  }
  return sent
}

function guessMime(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (n.endsWith('.doc')) return 'application/msword'
  if (n.endsWith('.xlsx'))
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (n.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (n.endsWith('.pptx'))
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.txt')) return 'text/plain'
  if (n.endsWith('.csv')) return 'text/csv'
  if (n.endsWith('.md')) return 'text/markdown'
  return 'application/octet-stream'
}
