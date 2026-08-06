import {
  processTelegramUpdatePayload,
} from '@/lib/telegram/bot'
import {
  telegramUpdateHasCallback,
  verifyTelegramWebhookSecret,
} from '@/lib/telegram/webhook-auth'
import { enforceWebhookRateLimit } from '@/lib/reliability/rate-limit'
import { dispatchChannelWorkflow } from '@/lib/workflows/channel-dispatch'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
/** Netlify function budget for agent + Telegram round-trips. */
export const maxDuration = 30

/**
 * Netlify-compatible Telegram webhook.
 *
 * Important: do NOT use grammy webhookCallback's strict secretToken gate.
 * That returns opaque 401 when TELEGRAM_WEBHOOK_SECRET is set but setWebhook
 * was registered without secret_token — outbound approve buttons work, clicks
 * silently no-op. We verify mismatch only; missing header is allowed (compat).
 *
 * Callback queries (Approve/Reject) always run inline so answerCallbackQuery
 * is guaranteed; text/voice may optionally queue via workflow dispatch.
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

    const secretCheck = verifyTelegramWebhookSecret(req)
    if (!secretCheck.ok) {
      return new Response('unauthorized', { status: 401 })
    }

    const payload = await req.json().catch(() => null)
    if (!payload) {
      return Response.json({ error: 'invalid_json' }, { status: 400 })
    }

    const isCallback = telegramUpdateHasCallback(payload)

    // HITL approve/reject must run in this request — async dispatch often
    // "succeeds" without answering the callback, which looks like a no-op.
    if (!isCallback) {
      const queued = await dispatchChannelWorkflow({
        kind: 'telegram_webhook',
        payload,
      })
      if (queued.queued) {
        return Response.json({ ok: true, queued: true }, { status: 202 })
      }
    }

    await processTelegramUpdatePayload(payload)
    return Response.json({ ok: true, processed: isCallback ? 'callback' : 'update' })
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

/** Optional health check for Netlify / webhook wiring. */
export async function GET() {
  return Response.json({
    ok: true,
    channel: 'telegram',
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    secretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()),
    secretMode: 'compat_missing_header_ok',
    groupSupport: {
      bindCommands: ['/link', '/start'],
      askCommands: ['/ask', '@mention'],
      privacyNoteAr:
        'مع Group Privacy الافتراضي يرى البوت الأوامر والذكر فقط — عطّله من BotFather ليرى كل الرسائل.',
    },
  })
}
