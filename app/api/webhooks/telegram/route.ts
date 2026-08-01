import { createTelegramWebhookHandler } from '@/lib/telegram/bot'

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
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return Response.json(
        { error: 'TELEGRAM_BOT_TOKEN is not configured' },
        { status: 503 }
      )
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
