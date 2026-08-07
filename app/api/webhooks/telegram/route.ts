import {
  processTelegramUpdatePayload,
} from '@/lib/telegram/bot'
import {
  telegramUpdateHasCallback,
  verifyTelegramWebhookSecret,
} from '@/lib/telegram/webhook-auth'
import { enforceWebhookRateLimit } from '@/lib/reliability/rate-limit'

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
 * Always process inline (including group /ask and HITL callbacks). Queuing to
 * Trigger.dev / self-dispatch has caused silent no-replies in groups.
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
      linkedGroupMode: 'natural_arabic_no_ask',
      triggers: [
        'plain_text_when_privacy_off',
        '@mention',
        'reply_to_bot',
        '/ask_optional',
        'voice_stt_intent_router',
        'document',
        'photo',
        'drive_brain_search',
        'room_calendar_create',
        'wake_cascade_agent1',
      ],
      privacyNoteAr:
        'بعد /link: عطّل Group Privacy من BotFather ليرى البوت كل الرسائل العادية بدون /ask. الخصوصية الافتراضية = أوامر ومنشن فقط.',
      limitsAr:
        'Drive يحتاج ربط Google من الموقع. OCR الممسوح أدق مع جسر ماك. الحذف فقط بموافقة.',
    },
    latency: {
      chatModelDefault: process.env.TELEGRAM_HARNESS_MODEL || 'gemini-2.5-flash',
      heavyModelDefault:
        process.env.TELEGRAM_HEAVY_MODEL ||
        process.env.DEFAULT_HARNESS_MODEL ||
        'gemini-3.1-pro',
      maxStepsChat: 4,
      maxStepsHeavy: 6,
      mcpDefault: process.env.TELEGRAM_INCLUDE_MCP === '1',
      voiceReplyTts: process.env.TELEGRAM_VOICE_REPLY || 'auto',
      voiceQuickButtons: [
        'run',
        'appointment',
        'task',
        'file',
        'message',
        'broadcast',
      ],
      fastPath: [
        'greeting',
        'calendar_count',
        'tasks_count',
        'message_dm_broadcast',
      ],
      updateDedupe: 'update_id_ttl_10m',
      calendarDisplayTz: 'Asia/Riyadh',
      wakePolicy: 'agent1_cascade',
      workIntents: [
        'appointment',
        'task',
        'file',
        'message',
        'question',
        'coordination_via_message',
      ],
      roomToolParity: 'full_native_on_work_turns',
      multiCommitteeLink: ['/link finance', '/link programs', '/link board'],
      messagingLimitsAr:
        'خاص فقط لمن بدأ البوت (Start). وإلا منشور موجّه في المجموعة المربوطة.',
    },
  })
}
