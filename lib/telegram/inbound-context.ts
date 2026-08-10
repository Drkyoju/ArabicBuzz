/**
 * Marks the current async chain as a reply to an inbound Telegram update.
 * Cron / digests / file-job resumes outside this store are "unsolicited".
 */
import { AsyncLocalStorage } from 'node:async_hooks'

type InboundStore = {
  chatId: string
}

const store = new AsyncLocalStorage<InboundStore>()

export function runWithTelegramInbound<T>(
  chatId: string,
  fn: () => Promise<T>
): Promise<T> {
  return store.run({ chatId: String(chatId) }, fn)
}

export function getTelegramInboundChatId(): string | null {
  const cur = store.getStore()
  return cur?.chatId ? String(cur.chatId) : null
}

/** True when this async chain is handling a webhook/update for this chat (or any chat). */
export function isInsideTelegramInbound(chatId?: string | null): boolean {
  const cur = store.getStore()
  if (!cur?.chatId) return false
  if (chatId == null || String(chatId).trim() === '') return true
  return String(cur.chatId) === String(chatId).trim()
}
