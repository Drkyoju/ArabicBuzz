/**
 * Finalize the single «جاري…» ack into the final group/DM reply.
 *
 * HARD RULE: one visible answer per turn. Never send a second copy of the
 * same (or already-streamed) text when editMessageText fails with
 * «message is not modified» or a transient error after the ack already
 * shows the answer.
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
}): boolean {
  const body = String(opts.finalText || '').slice(0, 4000)
  const already = String(opts.alreadyDisplayedText || '').slice(0, 4000)
  if (!body) return true
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
 */
export function decideFinalizeAckFallback(opts: {
  finalText: string
  alreadyDisplayedText?: string
  editError?: unknown
}): 'already' | 'reply' | 'left_ack' {
  if (
    shouldSkipDuplicateFinalizeReply({
      finalText: opts.finalText,
      alreadyDisplayedText: opts.alreadyDisplayedText,
      editError: opts.editError,
    })
  ) {
    if (
      opts.editError &&
      isTelegramMessageNotModifiedError(opts.editError)
    ) {
      return 'already'
    }
    const already = String(opts.alreadyDisplayedText || '').trim()
    if (already && already !== 'جاري…') return 'left_ack'
    return 'already'
  }
  return 'reply'
}
