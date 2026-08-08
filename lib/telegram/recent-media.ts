/**
 * Remember Telegram-ingested vault files per chat so follow-up text/voice
 * can operate on the attachment without requiring Drive.
 */
import { formatDownloadMarker } from '@/lib/files/file-markers'

export type RecentTelegramMedia = {
  fileId: string
  name: string
  mimeType: string
  scopeId: string
  /** Telegram Bot API file_id when known (reply re-ingest). */
  telegramFileId?: string
  at: number
}

const TTL_MS = 45 * 60 * 1000
const MAX_PER_CHAT = 8

const byChat = new Map<string, RecentTelegramMedia[]>()

function prune(chatId: string) {
  const now = Date.now()
  const list = (byChat.get(chatId) || []).filter((m) => now - m.at < TTL_MS)
  if (list.length) byChat.set(chatId, list)
  else byChat.delete(chatId)
  return list
}

export function rememberTelegramMedia(
  chatId: string,
  media: Omit<RecentTelegramMedia, 'at'> & { at?: number }
): void {
  if (!chatId || !media.fileId) return
  const list = prune(chatId)
  const next: RecentTelegramMedia = {
    fileId: media.fileId,
    name: media.name,
    mimeType: media.mimeType,
    scopeId: media.scopeId,
    telegramFileId: media.telegramFileId,
    at: media.at ?? Date.now(),
  }
  const filtered = list.filter((m) => m.fileId !== next.fileId)
  filtered.unshift(next)
  byChat.set(chatId, filtered.slice(0, MAX_PER_CHAT))
}

export function getRecentTelegramMedia(
  chatId: string,
  limit = 3
): RecentTelegramMedia[] {
  return prune(chatId).slice(0, Math.max(1, limit))
}

export function getLatestTelegramMedia(
  chatId: string
): RecentTelegramMedia | null {
  return getRecentTelegramMedia(chatId, 1)[0] || null
}

/**
 * Prompt block: prefer these vault fileIds as the working copy.
 * Drive is optional and must not block.
 */
export function formatRecentTelegramMediaHint(chatId: string): string {
  const items = getRecentTelegramMedia(chatId, 3)
  if (!items.length) return ''
  const lines = items.map((m, i) => {
    const marker = formatDownloadMarker({
      name: m.name,
      fileId: m.fileId,
      kind: m.mimeType.startsWith('audio/') ? 'voice' : 'file',
    })
    return `${i + 1}. «${m.name}» (fileId=${m.fileId}, mime=${m.mimeType})\n${marker}`
  })
  return [
    '[مرفقات تيليجرام الأخيرة في هذه المحادثة — هذه نسخة العمل]',
    'نفّذ على fileId أعلاه مباشرة (read/edit/convert/ocr ثم return_file).',
    'لا تنتظر Google Drive ولا brain_open_document إلا إن طلب المستخدم صراحة ملف من الدرايف.',
    ...lines,
  ].join('\n')
}

/** Clear store (tests). */
export function clearTelegramRecentMediaForTests(): void {
  byChat.clear()
}
