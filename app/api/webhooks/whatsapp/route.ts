import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { enforceWebhookRateLimit } from '@/lib/reliability/rate-limit'
import { dispatchChannelWorkflow } from '@/lib/workflows/channel-dispatch'
import { processWhatsAppPayload } from '@/lib/whatsapp/webhook-processor'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
/** Netlify function budget for Whisper + agent + Graph reply. */
export const maxDuration = 30

/**
 * Meta webhook verification (hub.mode / hub.verify_token / hub.challenge).
 */
export async function GET(req: NextRequest) {
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
 * Incoming WhatsApp Cloud API events.
 * Returns 200 OK immediately; heavy work runs via `after()` within Netlify limits.
 */
export async function POST(req: NextRequest) {
  const limit = await enforceWebhookRateLimit({ req, channel: 'whatsapp' })
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterMs: Math.max(0, limit.reset - Date.now()) },
      { status: 429 }
    )
  }

  let payload: unknown
  try {
    payload = await req.json()
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
