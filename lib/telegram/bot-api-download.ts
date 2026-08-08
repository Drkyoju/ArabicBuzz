/**
 * Direct Bot API getFile + file download (cloud or local telegram-bot-api).
 * No Mac hop — safe to import from mac-sync-agent.
 */

import {
  isCloudTelegramApiRoot,
  telegramBotApiFileUrl,
  telegramBotApiMethodUrl,
  telegramBotApiRootsForDownload,
} from '@/lib/telegram/bot-api-root'

export type BotApiDownloadedFile = {
  buffer: Buffer
  filePath: string
  source: 'local_bot_api' | 'cloud_bot_api'
  remoteSize?: number
}

export async function downloadTelegramFileViaBotApiRoots(opts: {
  token: string
  fileId: string
  preferLocal?: boolean
  /** Override roots (e.g. Mac defaults to 127.0.0.1:8081) */
  roots?: string[]
}): Promise<BotApiDownloadedFile | null> {
  const roots =
    opts.roots ||
    telegramBotApiRootsForDownload({ preferLocal: opts.preferLocal !== false })
  for (const root of roots) {
    try {
      const hit = await downloadOnce(root, opts.token, opts.fileId)
      if (hit) return hit
    } catch (e) {
      console.warn('[telegram] bot-api download', root, e)
    }
  }
  return null
}

async function downloadOnce(
  apiRoot: string,
  token: string,
  fileId: string
): Promise<BotApiDownloadedFile | null> {
  const url = telegramBotApiMethodUrl(apiRoot, token, 'getFile')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  })
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean
    result?: { file_path?: string; file_size?: number }
  } | null
  if (!data?.ok || !data.result?.file_path) return null
  const fileUrl = telegramBotApiFileUrl(apiRoot, token, data.result.file_path)
  const fileRes = await fetch(fileUrl)
  if (!fileRes.ok) return null
  const buffer = Buffer.from(await fileRes.arrayBuffer())
  if (!buffer.length) return null
  return {
    buffer,
    filePath: data.result.file_path,
    source: isCloudTelegramApiRoot(apiRoot) ? 'cloud_bot_api' : 'local_bot_api',
    remoteSize: data.result.file_size,
  }
}

/** Default local Bot API listen URL used by deploy/telegram-bot-api. */
export const DEFAULT_LOCAL_BOT_API = 'http://127.0.0.1:8081'
