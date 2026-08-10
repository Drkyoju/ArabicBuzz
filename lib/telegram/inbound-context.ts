/**
 * Marks Telegram outbound as a reply to an inbound update.
 * Prefer passing meta.inboundReply / meta.solicited into emit* helpers.
 * Avoid node:async_hooks — it breaks the Next.js client bundle.
 */

/** True when meta explicitly allows a group send during silence. */
export function metaAllowsSolicitedTelegram(
  meta?: Record<string, unknown> | null
): boolean {
  if (!meta) return false
  return meta.inboundReply === true || meta.solicited === true
}
