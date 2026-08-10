import { after } from 'next/server'
import {
  claimTelegramUpdatePayload,
  handleClaimedTelegramUpdate,
} from '@/lib/telegram/bot'
import {
  telegramUpdateHasCallback,
  verifyTelegramWebhookSecret,
} from '@/lib/telegram/webhook-auth'
import { enforceWebhookRateLimit } from '@/lib/reliability/rate-limit'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
/** Netlify/CranL budget for agent + Telegram round-trips (after ACK). */
export const maxDuration = 60

/**
 * Netlify-compatible Telegram webhook.
 *
 * Important: do NOT use grammy webhookCallback's strict secretToken gate.
 * That returns opaque 401 when TELEGRAM_WEBHOOK_SECRET is set but setWebhook
 * was registered without secret_token — outbound approve buttons work, clicks
 * silently no-op. We verify mismatch only; missing header is allowed (compat).
 *
 * Fast ACK: claim dedupe keys first, return 200 immediately, then process via
 * after(). Slow sync replies caused Telegram retries (and duplicate agent turns
 * when update_id somehow differed / cold instances raced).
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
    const gate = await claimTelegramUpdatePayload(payload)
    if (!gate.claimed) {
      return Response.json({
        ok: true,
        duplicate: true,
        reason: gate.reason || 'deduped',
      })
    }

    after(async () => {
      try {
        await handleClaimedTelegramUpdate(payload)
      } catch (e) {
        console.error('[telegram webhook after]', e)
      }
    })

    return Response.json({
      ok: true,
      accepted: true,
      processed: isCallback ? 'callback' : 'update',
    })
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
      linkedGroupMode: 'intent_execute_reply_casual_silent',
      triggers: [
        'plain_text_no_mention_required',
        'intent_gate_not_mention_gate',
        'voice_stt_then_intent',
        'document_caption_intent',
        '@mention_optional',
        'reply_to_bot',
        '/ask_optional',
        'drive_brain_search',
        'room_calendar_create',
        'wake_cascade_agent1',
      ],
      privacyNoteAr:
        'بعد /link: عطّل Group Privacy. القصد يحدد الرد — بدون منشن: طلب → تنفيذ + ناتج؛ دردشة بشرية → صامت. المنشن اختياري.',
      limitsAr:
        'Drive يحتاج ربط Google من الموقع. OCR الممسوح أدق مع جسر ماك. الحذف فقط بموافقة. البوت لا يحذف رسائل تيليجرام أبداً. PDF عربي: pdf_replace_text أدق من إعادة البناء.',
    },
    latency: {
      chatModelDefault: process.env.TELEGRAM_HARNESS_MODEL || 'gemini-2.5-flash',
      heavyModelDefault:
        process.env.TELEGRAM_HEAVY_MODEL ||
        process.env.DEFAULT_HARNESS_MODEL ||
        'gemini-3.1-pro',
      maxStepsChat: 6,
      maxStepsHeavy: 8,
      mcpDefault:
        process.env.TELEGRAM_INCLUDE_MCP?.trim() === '1' ||
        process.env.TELEGRAM_INCLUDE_MCP?.trim() !== '0',
      voiceReplyTts: process.env.TELEGRAM_VOICE_REPLY || 'auto',
      voiceQuickButtons: [
        'run',
        'appointment',
        'task',
        'file',
        'mail',
        'message',
        'broadcast',
        'wake',
      ],
      voiceAutoExecute: true,
      mentionOptional: true,
      intentGate: true,
      silentGroupFileDelivery: true,
      fastPath: [
        'greeting',
        'calendar_count',
        'tasks_count',
        'message_dm_broadcast',
      ],
      updateDedupe:
        'update_id_ttl_10m+message_key+content_key+chat_turn_lock+prisma_fallback',
      groupAckPolicy: 'groups_no_jari_single_final_reply_edit_only_if_ack',
      webhookAck: 'claim_then_200_then_after_handle',
      calendarDisplayTz: 'Asia/Riyadh',
      wakePolicy: 'agent1_cascade',
      workIntents: [
        'appointment',
        'task',
        'file',
        'mail',
        'message',
        'question',
        'morning_brief',
        'room_search',
        'wake_agent',
        'coordination_via_message',
      ],
      roomToolParity: 'full_native_on_all_non_casual_turns',
      pocketTools: [
        'room_search',
        'owner_morning_brief',
        'pdf_annotate',
        'send_director_digest',
        'drive_list_files',
        'drive_search_files',
        'drive_upload_file',
        'drive_get_link',
        'list_letter_templates',
        'letter_fill_template',
        'minutes_from_thread',
        'web_search',
        'web_fetch',
        'wikipedia_lookup',
        'youtube_transcript',
        'math_eval',
        'domain_intel',
        'arxiv_search',
        'fx_rate',
        'geocode',
        'dictionary_lookup',
        'hn_search',
      ],
      helpConceptsAr: [
        'ويكيبيديا → wikipedia_lookup',
        'يوتيوب → youtube_transcript',
        'احسب → math_eval',
        'نطاق / DNS → domain_intel',
        'arXiv → arxiv_search',
        'صرف → fx_rate',
        'أين تقع → geocode',
        'تعريف → dictionary_lookup',
        'Hacker News → hn_search',
        'ابحث في جوجل → web_search (DDG مجاني)',
      ],
      hermesSeparationAr:
        'هيرميس = واتساب فقط على الماك. هذا البوت تيليجرام الجمعية فقط — لا واتساب داخل الموقع.',
      visualUiNotMirrored: [
        'pdf_expert_canvas',
        'tiptap_toolbar',
        'tldraw_whiteboard',
      ],
      googleOAuthOnceViaBrowser:
        'https://arabicbuzz-fooc9h.cranl.net/?section=settings',
      personalTelegramUserLink: '/link account <workspace-uuid>',
      interactiveHelpMenu: true,
      orgMailMembersAllowed: true,
      neverDeleteTelegramMessages: true,
      multiCommitteeLink: ['/link finance', '/link programs', '/link board'],
      messagingLimitsAr:
        'خاص فقط لمن بدأ البوت (Start). وإلا منشور موجّه في المجموعة المربوطة.',
    },
  })
}
