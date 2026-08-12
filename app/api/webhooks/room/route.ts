import { NextRequest, NextResponse } from 'next/server'
import { enforceWebhookRateLimit } from '@/lib/reliability/rate-limit'
import { enqueueAssistantJob } from '@/lib/assistants/queue'
import { registerScheduledTask } from '@/lib/cron/register'
import { insertRoomPost } from '@/lib/rooms/persist'
import { mirrorChannelTurnToRoom } from '@/lib/rooms/channel-mirror'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

function roomWebhookSecret(): string | null {
  return (
    process.env.ROOM_WEBHOOK_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    null
  )
}

function verifyRoomWebhook(req: NextRequest): boolean {
  const secret = roomWebhookSecret()
  if (!secret) return false
  const bearer = req.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim()
  const header =
    req.headers.get('x-ab-room-secret')?.trim() ||
    req.headers.get('x-webhook-secret')?.trim()
  const token = bearer || header || ''
  return token.length > 0 && token === secret
}

/**
 * Health / setup hint — no secrets in response.
 * POST triggers room-scoped background work (assistant queue or cron register).
 *
 * Env: ROOM_WEBHOOK_SECRET (or CRON_SECRET fallback)
 * Body: { scopeId?, prompt?, message?, trigger?, action?: 'enqueue'|'schedule'|'note', cronExpr?, nameAr? }
 */
export async function GET() {
  const configured = Boolean(roomWebhookSecret())
  return NextResponse.json({
    ok: true,
    configured,
    messageAr: configured
      ? 'ويب هوك الغرفة جاهز — أرسل POST مع Authorization: Bearer <ROOM_WEBHOOK_SECRET>'
      : 'عيّن ROOM_WEBHOOK_SECRET على CranL لتفعيل ويب هوك الغرفة',
    webhookUrl: 'https://arabicbuzz-fooc9h.cranl.net/api/webhooks/room',
    channelsAr:
      'القنوات: الموقع (أساسي) · تيليجرام @alhuda14bot · واتساب اختياري عبر جسر مجاني — لا Slack',
  })
}

export async function POST(req: NextRequest) {
  if (!verifyRoomWebhook(req)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const limit = await enforceWebhookRateLimit({ req, channel: 'room-webhook' })
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterMs: Math.max(0, limit.reset - Date.now()) },
      { status: 429 }
    )
  }

  let body: {
    scopeId?: string
    prompt?: string
    message?: string
    trigger?: string
    action?: 'enqueue' | 'schedule' | 'note' | 'mirror_telegram'
    cronExpr?: string
    nameAr?: string
    notifyChannels?: string[]
    externalId?: string
    userLabelAr?: string
    agentReplyAr?: string
    destructive?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 })
  }

  const scopeId = String(body.scopeId || 'shared-demo').trim() || 'shared-demo'
  const trigger = String(body.trigger || 'webhook').trim()
  const action = body.action || 'enqueue'
  const prompt = String(body.prompt || body.message || '').trim()

  if (action === 'note') {
    const content = prompt || `حدث ويب هوك: ${trigger}`
    const result = await insertRoomPost({
      scopeId,
      authorKind: 'system',
      authorId: 'room-webhook',
      authorNameAr: 'ويب هوك الغرفة',
      content,
    })
    return NextResponse.json({
      ok: result.ok,
      postId: result.post?.id,
      messageAr: 'سُجّلت ملاحظة في الغرفة',
    })
  }

  if (action === 'mirror_telegram') {
    const externalId = String(body.externalId || 'webhook').trim()
    if (!prompt) {
      return NextResponse.json({ error: 'prompt مطلوب' }, { status: 400 })
    }
    await mirrorChannelTurnToRoom({
      scopeId,
      channel: 'telegram',
      externalId,
      userLabelAr: body.userLabelAr || 'ويب هوك',
      userMessageAr: prompt,
      agentReplyAr: body.agentReplyAr || '',
      includeAgentReply: Boolean(body.agentReplyAr),
    })
    return NextResponse.json({
      ok: true,
      messageAr: 'تمت مرآة السطر إلى سياق الغرفة/تيليجرام',
    })
  }

  if (action === 'schedule') {
    if (!prompt || !body.cronExpr) {
      return NextResponse.json(
        { error: 'prompt و cronExpr مطلوبان للجدولة' },
        { status: 400 }
      )
    }
    const nameAr = String(body.nameAr || `مهمة ويب هوك · ${trigger}`).trim()
    const task = await registerScheduledTask({
      scopeId,
      nameAr,
      prompt,
      cronExpr: String(body.cronExpr),
      notifyChannels: Array.isArray(body.notifyChannels)
        ? body.notifyChannels
        : [],
    })
    return NextResponse.json({
      ok: true,
      taskId: task.id,
      messageAr: `سُجّلت مهمة مجدولة «${nameAr}»`,
    })
  }

  if (!prompt) {
    return NextResponse.json({ error: 'prompt مطلوب' }, { status: 400 })
  }

  const destructive = Boolean(body.destructive)
  const { job, maxParallel } = await enqueueAssistantJob({
    scopeId,
    userId: 'room-webhook',
    message: `[${trigger}] ${prompt}`,
    assistantId: destructive ? 'agent-compliance' : 'agent-cron',
  })

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    maxParallel,
    messageAr: destructive
      ? 'أُضيفت مهمة حساسة — قد تتطلب موافقة بشرية (HITL)'
      : 'أُضيفت مهمة خلفية للغرفة',
  })
}
