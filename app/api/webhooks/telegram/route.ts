import { createTelegramWebhookHandler } from '@/lib/telegram/bot'
import { enforceWebhookRateLimit } from '@/lib/reliability/rate-limit'
import { dispatchChannelWorkflow } from '@/lib/workflows/channel-dispatch'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
/** Netlify function budget for agent + Telegram round-trips. */
export const maxDuration = 30

/**
 * Netlify-compatible Telegram webhook.
 * grammy parses updates; text → Agent Engine; callbacks → approve_/reject_.
 */
export async function POST(req: Request) {
  try {
    const limit = await enforceWebhookRateLimit({ req, channel: 'telegram' })
    if (!limit.ok) {
      return Response.json(
        { error: 'rate_limited', retryAfterMs: Math.max(0, limit.reset - Date.now()) },
        { status: 429 }
      )
    }
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return Response.json(
        { error: 'TELEGRAM_BOT_TOKEN is not configured' },
        { status: 503 }
      )
    }
    const cloned = req.clone()
    const payload = await cloned.json().catch(() => null)
    if (payload) {
      const queued = await dispatchChannelWorkflow({
        kind: 'telegram_webhook',
        payload,
      })
      if (queued.queued) {
        return Response.json({ ok: true, queued: true }, { status: 202 })
      }
    }
    const handler = createTelegramWebhookHandler()
    return await handler(req)
  } catch (e) {
    console.error('[telegram webhook]', e)
    return Response.json(
      {
        error: e instanceof Error ? e.message : 'webhook_error',
      },
      { status: 500 }
    )
  }
}

/** Optional health check for Netlify / ngrok wiring. */
export async function GET() {
  return Response.json({
    ok: true,
    channel: 'telegram',
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  })
}
