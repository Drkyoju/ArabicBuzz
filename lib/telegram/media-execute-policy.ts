/**
 * When Telegram media/voice/text must EXECUTE (not silent archive-only).
 * Drive is never required for this gate.
 */
import { classifyTelegramWorkIntent } from '@/lib/telegram/power-path'
import { resolveGroupReplyMode } from '@/lib/telegram/group-reply-policy'

export type TelegramMediaExecuteDecision = {
  /** Intent kind fed to resolveGroupReplyMode / agent. */
  workKind: string
  /** True → run agent + reply (or Arabic error). False → archive/watch only. */
  shouldExecute: boolean
  /** Non-empty caption / transcript / text after strip. */
  requestText: string
}

/**
 * Document/photo/video (+ optional caption).
 * Any non-empty caption = work request → execute.
 * Empty caption in group without mention = archive only (file remembered for follow-up).
 */
export function decideTelegramMediaExecute(opts: {
  captionOrText: string
  inGroup: boolean
  mentioned: boolean
  isReplyToBot: boolean
}): TelegramMediaExecuteDecision {
  const requestText = (opts.captionOrText || '').trim()
  const classified = classifyTelegramWorkIntent(requestText)
  const workKind =
    requestText.length > 0
      ? classified.kind === 'casual'
        ? 'file'
        : classified.kind
      : !opts.inGroup || opts.mentioned || opts.isReplyToBot
        ? 'file'
        : 'casual'
  const replyMode = resolveGroupReplyMode({
    inGroup: opts.inGroup,
    mentioned: opts.mentioned,
    isReplyToBot: opts.isReplyToBot,
    workKind,
  })
  return {
    workKind,
    shouldExecute: replyMode === 'full',
    requestText,
  }
}

/**
 * Voice STT / follow-up text: execute when intent is non-casual or addressed.
 */
export function decideTelegramVoiceOrTextExecute(opts: {
  transcriptOrText: string
  inGroup: boolean
  mentioned: boolean
  isReplyToBot: boolean
}): TelegramMediaExecuteDecision {
  const requestText = (opts.transcriptOrText || '').trim()
  const classified = classifyTelegramWorkIntent(requestText)
  const replyMode = resolveGroupReplyMode({
    inGroup: opts.inGroup,
    mentioned: opts.mentioned,
    isReplyToBot: opts.isReplyToBot,
    workKind: classified.kind,
  })
  return {
    workKind: classified.kind,
    shouldExecute: replyMode === 'full',
    requestText,
  }
}

/** Guard: never silent-archive when the user attached a work caption. */
export function assertCaptionWorkMustExecute(
  caption: string,
  shouldExecute: boolean
): void {
  const t = (caption || '').trim()
  if (!t) return
  if (!shouldExecute) {
    throw new Error(
      'telegram_media_policy: caption work request must execute (not archive-only)'
    )
  }
}
