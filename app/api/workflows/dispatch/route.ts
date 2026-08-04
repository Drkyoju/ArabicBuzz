import { NextRequest, NextResponse } from 'next/server'
import { processTelegramUpdatePayload } from '@/lib/telegram/bot'
import { processWhatsAppPayload } from '@/lib/whatsapp/webhook-processor'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

type Body = {
  kind?: 'telegram_webhook' | 'whatsapp_webhook'
  payload?: unknown
  createdAt?: string
}

export async function POST(req: NextRequest) {
  const secret = process.env.TRIGGER_DEV_WEBHOOK_SECRET?.trim()
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!body.kind || body.payload === undefined) {
    return NextResponse.json({ error: 'kind_and_payload_required' }, { status: 400 })
  }

  try {
    if (body.kind === 'telegram_webhook') {
      await processTelegramUpdatePayload(body.payload)
      return NextResponse.json({ ok: true, processed: 'telegram' })
    }
    if (body.kind === 'whatsapp_webhook') {
      await processWhatsAppPayload(body.payload)
      return NextResponse.json({ ok: true, processed: 'whatsapp' })
    }
    return NextResponse.json({ error: 'unsupported_kind' }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'dispatch_error' },
      { status: 500 }
    )
  }
}

