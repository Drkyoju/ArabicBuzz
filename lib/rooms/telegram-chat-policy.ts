/**
 * Product rule: Telegram group text lives in the live Telegram pane by default.
 * For association rooms, optional mirror into غرفة الفريق chat (shared context).
 * Media (docs/voice/photo/video) still imports into the room vault / Drive.
 */

export function isTelegramFeedOnlyPost(post: {
  channel?: string | null
}): boolean {
  return String(post.channel || '').toLowerCase() === 'telegram'
}

function parseMirrorScopes(): string[] {
  const raw = process.env.TELEGRAM_MIRROR_ROOM_SCOPES?.trim()
  if (raw) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return ['shared-demo']
}

/** Mirror TG turns into web room chat for listed scopes (default: shared-demo). */
export function telegramMirrorInRoomChat(scopeId?: string | null): boolean {
  if (process.env.TELEGRAM_MIRROR_ROOM_CHAT === '0') return false
  if (process.env.TELEGRAM_MIRROR_ROOM_CHAT === '1') return true
  if (!scopeId) return false
  return parseMirrorScopes().includes(scopeId)
}

/** Keep post in telegram-feed / pane; optionally include in room chat timeline. */
export function shouldShowInRoomChat(post: {
  channel?: string | null
  content?: string
  scopeId?: string | null
}): boolean {
  if (isTelegramFeedOnlyPost(post)) {
    return telegramMirrorInRoomChat(post.scopeId)
  }
  return true
}
