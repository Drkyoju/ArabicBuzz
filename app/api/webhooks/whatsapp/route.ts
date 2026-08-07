import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { enforceWebhookRateLimit } from '@/lib/reliability/rate-limit'
import { dispatchChannelWorkflow } from '@/lib/workflows/channel-dispatch'
import {
  resolveWhatsAppTransport,
  verifyWhatsAppBridgeSignature,
  whatsappBridgeSecret,
} from '@/lib/whatsapp/bridge'
import { processWhatsAppPayload } from '@/lib/whatsapp/webhook-processor'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
/** Netlify function budget for STT + agent + bridge/Meta reply. */
export const maxDuration = 30

/**
 * Meta verify OR free-bridge health ping.
 * Bridge: GET ?bridge=1 → status (no secrets).
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('bridge') === '1') {
    const transport = resolveWhatsAppTransport()
    return NextResponse.json({
      ok: true,
      transport,
      messageAr:
        transport === 'bridge'
          ? 'جسر واتساب المجاني مضبوط — أرسل الأحداث إلى هذا المسار POST'
          : 'لا جسر مضبوط — عيّن WHATSAPP_BRIDGE_URL على CranL بعد تشغيل Evolution/Baileys',
      webhookUrl: 'https://arabicbuzz-fooc9h.cranl.net/api/webhooks/whatsapp',
    })
  }

  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * Incoming WhatsApp: Meta Cloud shape OR free Evolution/Baileys bridge.
 * Returns 200 OK immediately; heavy work runs via `after()`.
 */
export async function POST(req: NextRequest) {
  const limit = await enforceWebhookRateLimit({ req, channel: 'whatsapp' })
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterMs: Math.max(0, limit.reset - Date.now()) },
      { status: 429 }
    )
  }

  const rawBody = await req.text().catch(() => '')
  if (whatsappBridgeSecret()) {
    const sig =
      req.headers.get('x-ab-bridge-signature') ||
      req.headers.get('x-hub-signature-256')
    if (!verifyWhatsAppBridgeSignature(rawBody, sig)) {
      // Evolution often uses apikey header instead of HMAC — allow if apikey matches
      const apiKey =
        req.headers.get('apikey') ||
        req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
      if (apiKey !== whatsappBridgeSecret()) {
        return NextResponse.json({ error: 'invalid_bridge_signature' }, { status: 401 })
      }
    }
  }

  let payload: unknown
  try {
    payload = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const queued = await dispatchChannelWorkflow({
    kind: 'whatsapp_webhook',
    payload,
  })
  if (queued.queued) {
    return NextResponse.json({ ok: true, queued: true }, { status: 202 })
  }

  after(async () => {
    await processWhatsAppPayload(payload)
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}
