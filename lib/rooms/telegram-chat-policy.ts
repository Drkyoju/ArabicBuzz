/**
 * Product rule: Telegram group text lives in the live Telegram pane only.
 * Mirroring every text turn into غرفة الفريق chat creates duplicate/مقرف threads.
 * Media (docs/voice/photo/video) still imports into the room vault / Drive.
 */

export function isTelegramFeedOnlyPost(post: {
  channel?: string | null
}): boolean {
  return String(post.channel || '').toLowerCase() === 'telegram'
}

/** Keep post in telegram-feed / pane; exclude from room chat timeline. */
export function shouldShowInRoomChat(post: {
  channel?: string | null
  content?: string
}): boolean {
  if (isTelegramFeedOnlyPost(post)) return false
  return true
}
