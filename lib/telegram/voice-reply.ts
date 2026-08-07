/**
 * Cheap Arabic TTS for short Telegram summaries.
 * Default: auto for short MSA replies. Opt-out: TELEGRAM_VOICE_REPLY=0
 * Force always: TELEGRAM_VOICE_REPLY=1
 */
export function shouldReplyWithTelegramVoice(text: string): boolean {
  const flag = (process.env.TELEGRAM_VOICE_REPLY || '').trim().toLowerCase()
  if (
    flag === '0' ||
    flag === 'off' ||
    flag === 'false' ||
    flag === 'no'
  ) {
    return false
  }
  if (
    flag === '1' ||
    flag === 'always' ||
    flag === 'true' ||
    flag === 'on'
  ) {
    return true
  }
  // auto (default)
  const t = (text || '').trim()
  if (t.length < 48 || t.length > 520) return false
  const arabic = (t.match(/[\u0600-\u06FF]/g) || []).length
  if (arabic < 24) return false
  // Skip long tool dumps / URLs-heavy replies
  if ((t.match(/https?:\/\//g) || []).length > 2) return false
  if (t.includes('```')) return false
  return true
}

/** Clip for cheap OpenAI tts-1 / ElevenLabs. */
export function clipForTelegramTts(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 480)
}
