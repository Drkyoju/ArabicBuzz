import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { extractWhatsAppMessages, type WaMessage } from '@/lib/whatsapp/parse'
import { resolveChannelScope } from '@/lib/channels/bindings'
import { DEMO_SCOPES, resolveActiveScope } from '@/lib/scopes/manager'
import { transcribeWhatsAppVoiceNote } from '@/lib/audio/transcribe'
import { sendWhatsAppText } from '@/lib/whatsapp/client'
import { resolveApproval } from '@/lib/agents/resolve-approval'
import { updateApprovalInSupabase } from '@/lib/supabase/server'
import { processWhatsAppInboxMessage } from '@/lib/whatsapp/inbox-orchestrator'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
/** Netlify function budget for Whisper + agent + Graph reply. */
export const maxDuration = 30

async function resolveWhatsAppScope(from: string) {
  const bound = await resolveChannelScope({
    channel: 'whatsapp',
    externalId: from,
    fallbackUserId: from,
  })
  if (bound) return bound
  return resolveActiveScope({
    userId: from,
    scopeId: process.env.WHATSAPP_DEFAULT_SCOPE_ID || 'shared-demo',
    scopes: DEMO_SCOPES,
  })
}

async function handleInteractive(message: WaMessage) {
  const id = message.interactive?.button_reply?.id || ''
  let decision: 'APPROVE' | 'REJECT' | null = null
  let approvalId = ''

  if (id.startsWith('approve_')) {
    decision = 'APPROVE'
    approvalId = id.slice('approve_'.length)
  } else if (id.startsWith('reject_')) {
    decision = 'REJECT'
    approvalId = id.slice('reject_'.length)
  } else if (id.startsWith('apprv:') || id.startsWith('rjct:')) {
    const [kind, aid] = id.split(':')
    decision = kind === 'apprv' ? 'APPROVE' : 'REJECT'
    approvalId = aid
  }

  if (!decision || !approvalId) return

  try {
    const result = await resolveApproval({
      approvalId,
      decision,
      approvedBy: message.from,
      userId: process.env.WHATSAPP_APPROVER_USER_ID || 'user-1',
      orgId: process.env.WHATSAPP_DEFAULT_ORG_ID || 'org-demo',
    })
    const detailAr =
      result.status === 'APPROVED'
        ? `✅ تمت الموافقة على الإجراء (${approvalId}) وتنفيذه.`
        : `❌ تم رفض الإجراء (${approvalId}).`
    await updateApprovalInSupabase({
      approvalId,
      status: result.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      resolvedBy: message.from,
      decisionNoteAr: detailAr,
    })
    await sendWhatsAppText(message.from, detailAr)
  } catch {
    await sendWhatsAppText(
      message.from,
      'تعذّر تسجيل قرار الموافقة. حاول مرة أخرى.'
    )
  }
}

async function handleInboundMessage(message: WaMessage) {
  const scope = await resolveWhatsAppScope(message.from)
  if (!scope) {
    await sendWhatsAppText(
      message.from,
      'يرجى ربط رقم واتساب بنطاق عمل أولاً.'
    )
    return
  }

  if (message.type === 'interactive') {
    await handleInteractive(message)
    return
  }

  if (message.type === 'audio' && message.audio?.id) {
    try {
      const { transcript } = await transcribeWhatsAppVoiceNote(message.audio.id)
      await processWhatsAppInboxMessage({
        from: message.from,
        textAr: transcript,
        inboundType: 'audio',
        scopeId: scope.scope.id,
      })
    } catch (e) {
      await sendWhatsAppText(
        message.from,
        e instanceof Error ? e.message : 'تعذر معالجة الصوت'
      )
    }
    return
  }

  if (message.type === 'text' && message.text?.body) {
    try {
      await processWhatsAppInboxMessage({
        from: message.from,
        textAr: message.text.body,
        inboundType: 'text',
        scopeId: scope.scope.id,
      })
    } catch (e) {
      await sendWhatsAppText(
        message.from,
        e instanceof Error
          ? `تعذّر معالجة الرسالة: ${e.message}`
          : 'تعذّر معالجة الرسالة حالياً.'
      )
    }
  }
}

async function processWhatsAppPayload(payload: unknown) {
  const messages = extractWhatsAppMessages(payload)
  for (const message of messages) {
    try {
      await handleInboundMessage(message)
    } catch (e) {
      console.error('[whatsapp] message failed', e)
    }
  }
}

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
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  after(async () => {
    await processWhatsAppPayload(payload)
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}
