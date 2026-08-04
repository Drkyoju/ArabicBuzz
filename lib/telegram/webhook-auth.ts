/**
 * Telegram webhook secret check.
 *
 * Grammy's webhookCallback rejects with 401 when `secretToken` is set but the
 * request lacks `X-Telegram-Bot-Api-Secret-Token`. That happens when
 * setWebhook was called without `secret_token` while Netlify still has
 * TELEGRAM_WEBHOOK_SECRET — outbound approve buttons work, clicks do nothing.
 *
 * Policy: reject only on an explicit mismatch. Missing header is allowed
 * (compat). Matching header is accepted.
 */
export function verifyTelegramWebhookSecret(req: Request): {
  ok: boolean
  reason?: 'mismatch'
} {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  if (!expected) return { ok: true }
  const got = req.headers.get('x-telegram-bot-api-secret-token') || ''
  if (!got) return { ok: true }
  if (got !== expected) return { ok: false, reason: 'mismatch' }
  return { ok: true }
}

export function telegramUpdateHasCallback(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  return Boolean((payload as { callback_query?: unknown }).callback_query)
}
