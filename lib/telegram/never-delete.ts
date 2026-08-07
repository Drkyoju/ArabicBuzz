/**
 * Hard ban: Arabic Buzz must never delete anything on Telegram
 * (messages, media, chat content). Progress = edit or leave + new reply.
 * Workspace/Drive HITL deletes must not cascade here.
 */
import type { Bot } from 'grammy'

/** Bot API methods that remove chat/message/media content — forever blocked. */
export const TELEGRAM_NEVER_DELETE_METHODS = [
  'deleteMessage',
  'deleteMessages',
  'deleteChatPhoto',
  'deleteForumTopic',
  'deleteBusinessMessages',
  'deleteStory',
  'deleteStickerFromSet',
] as const

export type TelegramNeverDeleteMethod =
  (typeof TELEGRAM_NEVER_DELETE_METHODS)[number]

const BANNED = new Set<string>(
  TELEGRAM_NEVER_DELETE_METHODS.map((m) => m.toLowerCase())
)

export class TelegramNeverDeleteError extends Error {
  readonly method: string
  constructor(method: string) {
    super(
      `حظر دائم: بوت Arabic Buzz لا يحذف أي شيء على تيليجرام (${method})`
    )
    this.name = 'TelegramNeverDeleteError'
    this.method = method
  }
}

/** True for Bot API methods that delete messages/media/chat content. */
export function isTelegramDeleteApiMethod(method: string): boolean {
  const raw = String(method || '')
    .trim()
    .replace(/^\/+/, '')
  const base = raw.includes('?') ? raw.slice(0, raw.indexOf('?')) : raw
  const name = base.includes('/')
    ? base.slice(base.lastIndexOf('/') + 1)
    : base
  const key = name.trim().toLowerCase()
  if (!key) return false
  if (BANNED.has(key)) return true
  // Catch future delete* content APIs without allowing deleteWebhook / deleteMyCommands
  if (key === 'deletewebhook' || key === 'deletemycommands') return false
  return (
    key.startsWith('deletemessage') ||
    key.startsWith('deletemessages') ||
    key.startsWith('deletechat') ||
    key.startsWith('deleteforum') ||
    key.startsWith('deletebusiness') ||
    key.startsWith('deletestory') ||
    key.startsWith('deletesticker')
  )
}

/**
 * Hard stop — call instead of any Telegram delete API.
 * Always throws; never returns.
 */
export function telegramNeverDelete(method: string): never {
  const m = String(method || 'unknown').trim() || 'unknown'
  console.error('[telegram] NEVER_DELETE blocked', m)
  throw new TelegramNeverDeleteError(m)
}

/** Assert method is allowed; throws TelegramNeverDeleteError if banned. */
export function assertTelegramApiMethodAllowed(method: string): void {
  if (isTelegramDeleteApiMethod(method)) {
    telegramNeverDelete(method)
  }
}

/** Extract Bot API method from a full api.telegram.org URL (or bare method). */
export function telegramMethodFromUrl(url: string | URL): string {
  const href = typeof url === 'string' ? url : url.href
  try {
    const u = new URL(href)
    const parts = u.pathname.split('/').filter(Boolean)
    // pathname: bot<token>/<method> (skip /file/bot… downloads)
    const botIdx = parts.findIndex((p) => /^bot\d/i.test(p) || p.startsWith('bot'))
    if (
      botIdx >= 0 &&
      parts[0] !== 'file' &&
      parts[botIdx + 1]
    ) {
      return parts[botIdx + 1]!
    }
    return parts[parts.length - 1] || ''
  } catch {
    return href.replace(/^\/+/, '').split(/[/?#]/)[0] || ''
  }
}

export function assertTelegramBotApiUrlAllowed(url: string | URL): void {
  const method = telegramMethodFromUrl(url)
  assertTelegramApiMethodAllowed(method)
}

/**
 * fetch() wrapper for api.telegram.org — blocks delete* before the network.
 */
export async function telegramBotApiFetch(
  input: string | URL,
  init?: RequestInit
): Promise<Response> {
  assertTelegramBotApiUrlAllowed(input)
  return fetch(input, init)
}

/** Install grammy Api transformer — every ctx.api / bot.api call is gated. */
export function installTelegramNeverDeleteGuard(bot: Bot): void {
  bot.api.config.use(async (prev, method, payload, signal) => {
    assertTelegramApiMethodAllowed(String(method))
    return prev(method, payload, signal)
  })
}
