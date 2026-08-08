import { InputFile, type Context } from 'grammy'
import { readWorkspaceFile, saveWorkspaceFile } from '@/lib/documents/workspace'
import { TELEGRAM_MAX_UPLOAD_BYTES } from '@/lib/telegram/attachment-deliver'

export type TelegramAttachmentRef = {
  fileId: string
  name: string
  mimeType?: string
  scopeId: string
  /** Tool that produced this attachment (for silent-group delivery filter). */
  toolName?: string
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
  fallbackScopeId: string,
  toolName?: string
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
      toolName: toolName || undefined,
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

/** Pull attachments from AI SDK generateText / streamText steps. */
export function extractAttachmentsFromAgentSteps(
  steps: unknown,
  fallbackScopeId: string
): TelegramAttachmentRef[] {
  const found: TelegramAttachmentRef[] = []
  if (!Array.isArray(steps)) return found
  for (const step of steps) {
    const toolResults = (
      step as {
        toolResults?: Array<{
          toolName?: string
          result?: unknown
          output?: unknown
        }>
      }
    ).toolResults
    if (!Array.isArray(toolResults)) continue
    for (const tr of toolResults) {
      const out = tr.result ?? tr.output
      const toolName = tr.toolName ? String(tr.toolName) : undefined
      for (const a of extractAttachmentsFromToolOutput(
        out,
        fallbackScopeId,
        toolName
      )) {
        if (!found.some((x) => x.fileId === a.fileId)) found.push(a)
      }
    }
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

export async function ingestTelegramVideoToWorkspace(opts: {
  ctx: Context
  scopeId: string
  fileId: string
  fileName?: string
  mimeType?: string
}): Promise<{ fileId: string; name: string; mimeType: string }> {
  const { buffer, filePath } = await downloadTelegramFileBuffer(
    opts.ctx,
    opts.fileId
  )
  const ext = filePath.includes('.')
    ? filePath.slice(filePath.lastIndexOf('.'))
    : '.mp4'
  const originalName =
    opts.fileName || `telegram-video-${Date.now()}${ext || '.mp4'}`
  const mime = opts.mimeType || 'video/mp4'
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

function isImageMime(mime?: string, name?: string): boolean {
  const m = (mime || '').toLowerCase()
  if (m.startsWith('image/') && !m.includes('svg')) return true
  const n = (name || '').toLowerCase()
  return /\.(jpe?g|png|webp|gif)$/i.test(n)
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
      const name = file.meta.originalName || a.name
      const mime = file.meta.mimeType || a.mimeType
      if (file.buffer.byteLength > TELEGRAM_MAX_UPLOAD_BYTES) {
        const mb = (file.buffer.byteLength / (1024 * 1024)).toFixed(1)
        await opts.ctx.reply(
          `الملف «${name}» تجاوز حد الإرسال عبر تيليجرام (~${mb} م.ب). يمكنك فتحه من خزنة الغرفة على الموقع.`
        )
        continue
      }
      const caption = (
        opts.captionAr || `📎 ${name}`
      ).slice(0, 1000)
      if (isImageMime(mime, name) && file.buffer.byteLength < 10 * 1024 * 1024) {
        try {
          await opts.ctx.replyWithPhoto(new InputFile(file.buffer, name), {
            caption,
          })
          sent.push(name)
          continue
        } catch {
          /* fall through to document */
        }
      }
      await opts.ctx.replyWithDocument(new InputFile(file.buffer, name), {
        caption,
      })
      sent.push(name)
    } catch (e) {
      console.error('[telegram] send attachment', a.fileId, e)
      try {
        await opts.ctx.reply(
          `لم نتمكّن من إرسال «${a.name}» هنا حالياً. يمكنك تنزيله من خزنة الغرفة على الموقع.`
        )
      } catch {
        /* ignore */
      }
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
