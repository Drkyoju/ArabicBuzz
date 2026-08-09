/**
 * Free large-Telegram-file download cascade (no paid APIs).
 *
 * Failover order:
 * 1) Local Bot API via TELEGRAM_BOT_API_URL (VPS 24/7 or Mac OrbStack when awake)
 * 2) Mac sync hop MAC_SYNC_URL → /telegram/fetch-file (local Bot API, then MTProto)
 * 3) Cloud Bot API (api.telegram.org) — soft ~20MB cap (tried inside Bot API roots)
 * 4) Room vault / Drive exact name — jobs resume without Mac (waiting_file → cron/mesh)
 *
 * OrbStack on a laptop needs the Mac awake — not always-on. For permanent large
 * getFile, run deploy/telegram-bot-api on any always-on host and set
 * TELEGRAM_BOT_API_URL on CranL (see docs/telegram-always-on-bot-api.md).
 *
 * CranL Basic cannot bake telegram-bot-api into the app image.
 */

import {
  TELEGRAM_MAX_DOWNLOAD_BYTES,
  telegramFileTooLargeAr,
} from '@/lib/telegram/attachment-deliver'
import { downloadTelegramFileViaBotApiRoots } from '@/lib/telegram/bot-api-download'
import { getTelegramLocalBotApiRoot } from '@/lib/telegram/bot-api-root'

export type TelegramDownloadSource =
  | 'local_bot_api'
  | 'mac_hop'
  | 'cloud_bot_api'
  | 'mtproto'

export type TelegramDownloadedFile = {
  buffer: Buffer
  filePath: string
  source: TelegramDownloadSource
  remoteSize?: number
}

export type TelegramLargeDownloadOpts = {
  fileId: string
  fileName?: string
  declaredSizeBytes?: number
  /** For MTProto / Mac hop message fetch */
  chatId?: string
  messageId?: string | number
  /** Skip Mac hop (unit tests / tight loops) */
  skipMacHop?: boolean
}

async function downloadViaMacHop(
  opts: TelegramLargeDownloadOpts
): Promise<TelegramDownloadedFile | null> {
  if (opts.skipMacHop) return null
  const { macSyncConfigured, getMacSyncConfig } = await import(
    '@/lib/storage/mac-sync-client'
  )
  if (!macSyncConfigured()) return null
  const { baseUrl, secret } = getMacSyncConfig()
  if (!baseUrl) return null

  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (secret) headers.set('Authorization', `Bearer ${secret}`)

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 180_000)
  try {
    const res = await fetch(`${baseUrl}/telegram/fetch-file`, {
      method: 'POST',
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        fileId: opts.fileId,
        fileName: opts.fileName,
        declaredSizeBytes: opts.declaredSizeBytes,
        chatId: opts.chatId,
        messageId: opts.messageId,
      }),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean
        contentBase64?: string
        filePath?: string
        source?: string
        remoteSize?: number
      } | null
      if (!j?.ok || !j.contentBase64) return null
      const buffer = Buffer.from(j.contentBase64, 'base64')
      if (!buffer.length) return null
      return {
        buffer,
        filePath: j.filePath || opts.fileName || 'telegram.bin',
        source:
          j.source === 'mtproto'
            ? 'mtproto'
            : j.source === 'local_bot_api'
              ? 'local_bot_api'
              : 'mac_hop',
        remoteSize: j.remoteSize,
      }
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    if (!buffer.length) return null
    return {
      buffer,
      filePath:
        res.headers.get('x-telegram-file-path') ||
        opts.fileName ||
        'telegram.bin',
      source: 'mac_hop',
    }
  } catch (e) {
    console.warn('[telegram] mac hop download failed', e)
    return null
  } finally {
    clearTimeout(t)
  }
}

/**
 * Download Telegram file bytes via free cascade.
 * Throws Arabic limit error only after all free paths fail.
 */
export async function downloadTelegramFileCascaded(
  opts: TelegramLargeDownloadOpts
): Promise<TelegramDownloadedFile> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')

  const declared = opts.declaredSizeBytes
  const preferLocal =
    typeof declared === 'number' &&
    Number.isFinite(declared) &&
    declared > TELEGRAM_MAX_DOWNLOAD_BYTES

  const errors: string[] = []

  try {
    const hit = await downloadTelegramFileViaBotApiRoots({
      token,
      fileId: opts.fileId,
      preferLocal,
    })
    if (hit) {
      return {
        buffer: hit.buffer,
        filePath: hit.filePath,
        source: hit.source,
        remoteSize: hit.remoteSize,
      }
    }
    errors.push('bot-api-roots: miss')
  } catch (e) {
    errors.push(
      `bot-api: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120)
    )
  }

  const mac = await downloadViaMacHop(opts)
  if (mac) return mac

  throw new Error(
    telegramFileTooLargeAr({
      fileName: opts.fileName,
      sizeBytes: declared,
    }) + (errors.length ? ` [${errors.slice(0, 3).join('; ')}]` : '')
  )
}

/** Status flags for health / ops (config only — use probeTelegramLargeFileHops for live). */
export function telegramLargeFilePathStatus(): {
  localBotApiConfigured: boolean
  macHopConfigured: boolean
  mtprotoEnvPresent: boolean
  freePathAr: string
} {
  const localBotApiConfigured = Boolean(getTelegramLocalBotApiRoot())
  const macHopConfigured = Boolean((process.env.MAC_SYNC_URL || '').trim())
  const mtprotoEnvPresent = Boolean(
    process.env.TELEGRAM_API_ID?.trim() &&
      process.env.TELEGRAM_API_HASH?.trim() &&
      (process.env.TELEGRAM_SESSION_STRING || process.env.TELEGRAM_SESSION || '')
        .trim()
  )
  return {
    localBotApiConfigured,
    macHopConfigured,
    mtprotoEnvPresent,
    freePathAr:
      'ملف كبير: Local Bot API → جسر الماك → MTProto → غرفة/Drive — بلا دفع وبلا إعادة إرسال',
  }
}
