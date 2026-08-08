/**
 * Telegram Bot API roots — cloud vs local (telegram-bot-api).
 *
 * CranL thin image cannot host telegram-bot-api (heavy TDLib binary + volume).
 * Point TELEGRAM_BOT_API_URL at an external sidecar (Mac / Fly / VPS) when
 * downloads must exceed the ~20MB cloud getFile limit.
 */

export const TELEGRAM_CLOUD_API_ROOT = 'https://api.telegram.org'

/** Local / sidecar Bot API base (no trailing slash). Empty = cloud only. */
export function getTelegramLocalBotApiRoot(): string {
  const raw = (
    process.env.TELEGRAM_BOT_API_URL ||
    process.env.TELEGRAM_BOT_API_ROOT ||
    ''
  )
    .trim()
    .replace(/\/$/, '')
  return raw
}

export function isLocalTelegramBotApiConfigured(): boolean {
  return Boolean(getTelegramLocalBotApiRoot())
}

/** Roots to try for getFile / file download, preferred first. */
export function telegramBotApiRootsForDownload(opts?: {
  preferLocal?: boolean
}): string[] {
  const local = getTelegramLocalBotApiRoot()
  const cloud = TELEGRAM_CLOUD_API_ROOT
  if (!local) return [cloud]
  if (opts?.preferLocal !== false) return [local, cloud]
  return [cloud, local]
}

export function telegramBotApiMethodUrl(
  apiRoot: string,
  token: string,
  method: string
): string {
  const root = apiRoot.replace(/\/$/, '')
  const m = method.replace(/^\//, '')
  return `${root}/bot${token}/${m}`
}

export function telegramBotApiFileUrl(
  apiRoot: string,
  token: string,
  filePath: string
): string {
  const root = apiRoot.replace(/\/$/, '')
  const path = filePath.replace(/^\//, '')
  return `${root}/file/bot${token}/${path}`
}

export function isCloudTelegramApiRoot(apiRoot: string): boolean {
  return /api\.telegram\.org/i.test(apiRoot)
}
