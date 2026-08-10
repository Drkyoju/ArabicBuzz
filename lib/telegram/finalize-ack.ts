/**
 * Finalize the single ack (if any) into the final group/DM reply.
 *
 * HARD RULE: one visible answer per turn.
 * - If an ack message already exists: EDIT ONLY — never ctx.reply fallback
 *   (that was the jari+final twin spam in «عمل الجمعية»).
 * - Groups: no «جاري…» at all — single final sendMessage only.
 */

export function isTelegramMessageNotModifiedError(err: unknown): boolean {
  const parts: string[] = []
  if (err instanceof Error) parts.push(err.message)
  if (err && typeof err === 'object') {
    const o = err as {
      description?: unknown
      error_description?: unknown
      message?: unknown
    }
    if (o.description != null) parts.push(String(o.description))
    if (o.error_description != null) parts.push(String(o.error_description))
    if (o.message != null) parts.push(String(o.message))
  } else if (err != null) {
    parts.push(String(err))
  }
  return /message is not modified/i.test(parts.join('\n'))
}

export type FinalizeAckMode = 'edited' | 'already' | 'replied' | 'left_ack'

export function shouldSkipDuplicateFinalizeReply(opts: {
  finalText: string
  alreadyDisplayedText?: string
  editError?: unknown
  /** When true (ack already posted), never allow a second sendMessage. */
  ackAlreadyPosted?: boolean
}): boolean {
  const body = String(opts.finalText || '').slice(0, 4000)
  const already = String(opts.alreadyDisplayedText || '').slice(0, 4000)
  if (!body) return true
  // Nuclear: any prior outbound for this turn → never send another copy.
  if (opts.ackAlreadyPosted) return true
  if (already && already === body) return true
  if (opts.editError && isTelegramMessageNotModifiedError(opts.editError)) {
    return true
  }
  // Stream already put a non-placeholder answer on screen — do not spam a twin.
  if (already.trim() && already !== 'جاري…' && !already.startsWith('✅ تم')) {
    return true
  }
  return false
}

/**
 * Pure decision helper for unit tests — mirrors finalizeTelegramAck branches.
 * With ackAlreadyPosted (default when messageId exists): never 'reply'.
 */
export function decideFinalizeAckFallback(opts: {
  finalText: string
  alreadyDisplayedText?: string
  editError?: unknown
  /** Default true when an ack message_id exists — ban reply fallback. */
  ackAlreadyPosted?: boolean
}): 'already' | 'reply' | 'left_ack' {
  const ackPosted = opts.ackAlreadyPosted === true
  if (
    shouldSkipDuplicateFinalizeReply({
      finalText: opts.finalText,
      alreadyDisplayedText: opts.alreadyDisplayedText,
      editError: opts.editError,
      ackAlreadyPosted: ackPosted,
    })
  ) {
    if (
      opts.editError &&
      isTelegramMessageNotModifiedError(opts.editError)
    ) {
      return 'already'
    }
    const already = String(opts.alreadyDisplayedText || '').trim()
    if (ackPosted) return already && already !== 'جاري…' ? 'left_ack' : 'left_ack'
    if (already && already !== 'جاري…') return 'left_ack'
    return 'already'
  }
  return 'reply'
}
