import { normalizeArabicPrompt } from '@/lib/ai/dialect-parser'
import { runAgentEngine } from '@/lib/agents/engine'
import { resolveChannelOwnerUserId } from '@/lib/channels/owner-context'
import { insertRoomPost } from '@/lib/rooms/persist'
import { saveWhatsAppTurnToSupabase } from '@/lib/supabase/server'
import { sendWhatsAppText } from '@/lib/whatsapp/client'
import {
  classifyWhatsAppIntent,
  classifyWhatsAppOutcome,
  type WhatsAppIntent,
  type WhatsAppIntentKind,
} from '@/lib/whatsapp/intent'
import {
  createInboxThread,
  findLatestPendingOwnerThread,
  getInboxThread,
  isOwnerPhone,
  updateInboxThread,
  type WhatsAppInboxThread,
} from '@/lib/whatsapp/pending-store'

export function intentKindLabelAr(kind: WhatsAppIntentKind): string {
  switch (kind) {
    case 'task':
      return 'مهمة'
    case 'order':
      return 'أمر'
    case 'confirmation':
      return 'تأكيد'
    case 'question':
      return 'سؤال'
    default:
      return 'أخرى'
  }
}

async function postRoomNote(opts: {
  scopeId: string
  externalId: string
  authorNameAr: string
  content: string
  authorKind?: 'channel' | 'agent' | 'system' | 'human'
  authorId?: string
}) {
  await insertRoomPost({
    scopeId: opts.scopeId,
    authorKind: opts.authorKind || 'system',
    authorId: opts.authorId || 'whatsapp-inbox',
    authorNameAr: opts.authorNameAr,
    content: opts.content,
    channel: 'whatsapp',
    externalId: opts.externalId,
  })
}

async function notifyOwner(opts: {
  scopeId: string
  requesterPhone: string
  messageAr: string
  authorNameAr?: string
}) {
  await postRoomNote({
    scopeId: opts.scopeId,
    externalId: opts.requesterPhone,
    authorNameAr: opts.authorNameAr || 'سؤال لك · واتساب',
    content: opts.messageAr,
    authorKind: 'system',
  })
  const ownerTo = process.env.WHATSAPP_OWNER_TO?.trim()
  if (ownerTo) {
    await sendWhatsAppText(ownerTo, opts.messageAr)
  }
}

async function runOwnerAgent(opts: {
  promptAr: string
  scopeId: string
  requesterPhone: string
  intent: WhatsAppIntent
  ownerAnswerAr?: string
}) {
  const normalized = await normalizeArabicPrompt(opts.promptAr)
  const modelSlug =
    process.env.DEFAULT_HARNESS_MODEL || 'gemini-2.5-pro'
  const ownerHint = opts.ownerAnswerAr
    ? `\n\nرد المالك على سؤالك السابق:\n${opts.ownerAnswerAr}`
    : ''
  const engine = await runAgentEngine({
    prompt: `${normalized.normalizedPromptAr}${ownerHint}`,
    system: `أنت وكيل Arabic Buzz تعمل نيابة عن مالك الحساب على صندوق وارد واتساب.
المرسل رقم واتساب: ${opts.requesterPhone}
تصنيف الرسالة: ${opts.intent.kind} — ${opts.intent.summaryAr}
نفّذ ما يمكن بالأدوات المتاحة (تقويم، Drive، RAG، …) بالعربية الفصحى المهنية بإيجاز.
إذا احتجت قراراً أو معلومة من المالك فقط، اذكر ذلك بوضوح في الرد دون اختلاق موافقات.
لا تدّعِ تنفيذ إجراءات حساسة دون موافقة HITL المعتادة.`,
    modelSlug,
    scopeId: opts.scopeId,
    requesterId: resolveChannelOwnerUserId(opts.requesterPhone),
    includeMcpTools: true,
  })
  return {
    text:
      engine.text?.trim() ||
      'تم استلام الطلب، لكن لم يُنتَج رد نصي كافٍ.',
    modelSlug,
  }
}

async function finalizeDone(opts: {
  thread: WhatsAppInboxThread | null
  scopeId: string
  requesterPhone: string
  inboundType: 'text' | 'audio'
  originalMessageAr: string
  intent: WhatsAppIntent
  agentText: string
  modelSlug: string
  messageArToRequester: string
  messageArToOwner: string
}) {
  if (opts.thread) {
    await updateInboxThread(opts.thread.id, {
      status: 'done',
      agentContextAr: opts.agentText,
    })
  }

  await postRoomNote({
    scopeId: opts.scopeId,
    externalId: opts.requesterPhone,
    authorNameAr: 'رد الوكيل · واتساب',
    content: opts.agentText,
    authorKind: 'agent',
    authorId: 'agent-whatsapp-inbox',
  })

  await postRoomNote({
    scopeId: opts.scopeId,
    externalId: opts.requesterPhone,
    authorNameAr: 'اكتمل · واتساب',
    content: opts.messageArToOwner,
    authorKind: 'system',
  })

  await saveWhatsAppTurnToSupabase({
    from: opts.requesterPhone,
    scopeId: opts.scopeId,
    inboundType: opts.inboundType,
    transcriptOrText: opts.originalMessageAr,
    agentReplyAr: opts.messageArToRequester,
    modelSlug: opts.modelSlug,
  })

  await sendWhatsAppText(opts.requesterPhone, opts.messageArToRequester)

  const ownerTo = process.env.WHATSAPP_OWNER_TO?.trim()
  if (ownerTo) {
    await sendWhatsAppText(
      ownerTo,
      `✅ ${opts.messageArToOwner}\n(المرسل: ${opts.requesterPhone})`
    )
  }
}

async function pauseForOwner(opts: {
  scopeId: string
  requesterPhone: string
  inboundType: 'text' | 'audio'
  originalMessageAr: string
  intent: WhatsAppIntent
  agentText: string
  ownerQuestionAr: string
  modelSlug: string
  existingThread?: WhatsAppInboxThread | null
}) {
  const thread =
    opts.existingThread ||
    (await createInboxThread({
      requesterPhone: opts.requesterPhone,
      scopeId: opts.scopeId,
      status: 'pending_owner',
      intentKind: opts.intent.kind,
      summaryAr: opts.intent.summaryAr,
      originalMessageAr: opts.originalMessageAr,
      inboundType: opts.inboundType,
      ownerQuestionAr: opts.ownerQuestionAr,
      agentContextAr: opts.agentText,
    }))

  if (opts.existingThread) {
    await updateInboxThread(thread.id, {
      status: 'pending_owner',
      ownerQuestionAr: opts.ownerQuestionAr,
      agentContextAr: opts.agentText,
    })
  }

  const askAr = `سؤال لك بخصوص واتساب من ${opts.requesterPhone} (#${thread.id.slice(0, 8)}):\n${opts.ownerQuestionAr}\n\nللرد من الغرفة: رد واتساب: …\nأو رد على واتساب من رقم المالك.`

  await notifyOwner({
    scopeId: opts.scopeId,
    requesterPhone: opts.requesterPhone,
    messageAr: askAr,
  })

  await postRoomNote({
    scopeId: opts.scopeId,
    externalId: opts.requesterPhone,
    authorNameAr: 'رد الوكيل · واتساب',
    content: opts.agentText,
    authorKind: 'agent',
    authorId: 'agent-whatsapp-inbox',
  })

  await sendWhatsAppText(
    opts.requesterPhone,
    'شكراً — جارٍ مراجعة طلبك مع المسؤول وسنعود إليك قريباً.'
  )

  await saveWhatsAppTurnToSupabase({
    from: opts.requesterPhone,
    scopeId: opts.scopeId,
    inboundType: opts.inboundType,
    transcriptOrText: opts.originalMessageAr,
    agentReplyAr: 'بانتظار رد المالك',
    modelSlug: opts.modelSlug,
  })

  return thread
}

/**
 * Process an inbound WhatsApp message from a requester (or resume path).
 */
export async function processWhatsAppInboxMessage(opts: {
  from: string
  textAr: string
  inboundType: 'text' | 'audio'
  scopeId: string
}): Promise<{ handled: true; mode: string } | { handled: false; error: string }> {
  const from = opts.from
  const textAr = opts.textAr.trim()
  if (!textAr) {
    return { handled: false, error: 'empty message' }
  }

  // Owner answering a paused thread via WhatsApp
  if (isOwnerPhone(from)) {
    const result = await resumeWhatsAppInboxWithOwnerAnswer({
      answerAr: textAr,
      answeredVia: 'whatsapp',
    })
    if (result.ok) return { handled: true, mode: 'owner_resume' }
    await sendWhatsAppText(
      from,
      result.error || 'لا يوجد طلب واتساب معلّق حالياً.'
    )
    return { handled: true, mode: 'owner_no_pending' }
  }

  const intent = await classifyWhatsAppIntent(textAr)
  const kindLabel = intentKindLabelAr(intent.kind)

  await postRoomNote({
    scopeId: opts.scopeId,
    externalId: from,
    authorNameAr: `طلب من واتساب · ${kindLabel}`,
    content:
      opts.inboundType === 'audio'
        ? `🎤 ${textAr}`
        : textAr,
    authorKind: 'channel',
    authorId: from,
  })

  const isWork = intent.kind === 'task' || intent.kind === 'order'

  if (!isWork) {
    const ownerNote = `وارد واتساب (${kindLabel}) من ${from}:\n${intent.summaryAr}\n\nالنص:\n${textAr.slice(0, 1500)}`
    await notifyOwner({
      scopeId: opts.scopeId,
      requesterPhone: from,
      messageAr: ownerNote,
      authorNameAr: 'ملاحظة لك · واتساب',
    })

    let ack =
      intent.kind === 'confirmation'
        ? 'شكراً، تم تسجيل تأكيدك وسيطّلع عليه المسؤول.'
        : intent.kind === 'question'
          ? 'شكراً لسؤالك — وصَل للمسؤول وسنرد عليك قريباً.'
          : 'شكراً، تم استلام رسالتك.'

    if (intent.urgency === 'high') {
      ack = `${ack}\n(تم تنبيه المسؤول بأولوية.)`
    }

    await sendWhatsAppText(from, ack)
    await saveWhatsAppTurnToSupabase({
      from,
      scopeId: opts.scopeId,
      inboundType: opts.inboundType,
      transcriptOrText: textAr,
      agentReplyAr: ack,
      modelSlug: 'inbox-notify',
    })
    return { handled: true, mode: 'owner_note' }
  }

  // Task / order — run agent
  const { text: agentText, modelSlug } = await runOwnerAgent({
    promptAr: textAr,
    scopeId: opts.scopeId,
    requesterPhone: from,
    intent,
  })

  const outcome = await classifyWhatsAppOutcome({
    originalMessageAr: textAr,
    agentTextAr: agentText,
    intent,
  })

  if (outcome.status === 'needs_owner') {
    await pauseForOwner({
      scopeId: opts.scopeId,
      requesterPhone: from,
      inboundType: opts.inboundType,
      originalMessageAr: textAr,
      intent,
      agentText,
      ownerQuestionAr: outcome.messageArToOwner || agentText,
      modelSlug,
    })
    return { handled: true, mode: 'pending_owner' }
  }

  if (outcome.status === 'needs_requester') {
    await postRoomNote({
      scopeId: opts.scopeId,
      externalId: from,
      authorNameAr: 'رد الوكيل · واتساب',
      content: agentText,
      authorKind: 'agent',
      authorId: 'agent-whatsapp-inbox',
    })
    await sendWhatsAppText(from, outcome.messageArToRequester)
    await saveWhatsAppTurnToSupabase({
      from,
      scopeId: opts.scopeId,
      inboundType: opts.inboundType,
      transcriptOrText: textAr,
      agentReplyAr: outcome.messageArToRequester,
      modelSlug,
    })
    return { handled: true, mode: 'needs_requester' }
  }

  await finalizeDone({
    thread: null,
    scopeId: opts.scopeId,
    requesterPhone: from,
    inboundType: opts.inboundType,
    originalMessageAr: textAr,
    intent,
    agentText,
    modelSlug,
    messageArToRequester: outcome.messageArToRequester || agentText,
    messageArToOwner: outcome.messageArToOwner,
  })
  return { handled: true, mode: 'done' }
}

/**
 * Resume a paused inbox thread after the owner answers (room or WhatsApp).
 */
export async function resumeWhatsAppInboxWithOwnerAnswer(opts: {
  threadId?: string
  answerAr: string
  answeredVia: 'whatsapp' | 'room'
  scopeId?: string
}): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  const answerAr = opts.answerAr.trim()
  if (!answerAr) return { ok: false, error: 'الإجابة فارغة.' }

  let thread: WhatsAppInboxThread | null = null
  if (opts.threadId) {
    thread = await getInboxThread(opts.threadId)
  } else {
    thread = await findLatestPendingOwnerThread(opts.scopeId)
  }

  if (!thread || thread.status !== 'pending_owner') {
    return { ok: false, error: 'لا يوجد طلب واتساب معلّق.' }
  }

  await updateInboxThread(thread.id, { status: 'running' })

  await postRoomNote({
    scopeId: thread.scopeId,
    externalId: thread.requesterPhone,
    authorNameAr: 'رد المالك · واتساب',
    content: answerAr,
    authorKind: 'human',
    authorId: 'owner',
  })

  const intent: WhatsAppIntent = {
    kind: thread.intentKind,
    summaryAr: thread.summaryAr,
    needsOwner: false,
    urgency: 'normal',
  }

  const promptAr = `${thread.originalMessageAr}\n\nسياق سابق من الوكيل:\n${thread.agentContextAr || '(لا يوجد)'}`

  try {
    const { text: agentText, modelSlug } = await runOwnerAgent({
      promptAr,
      scopeId: thread.scopeId,
      requesterPhone: thread.requesterPhone,
      intent,
      ownerAnswerAr: answerAr,
    })

    const outcome = await classifyWhatsAppOutcome({
      originalMessageAr: thread.originalMessageAr,
      agentTextAr: agentText,
      intent,
    })

    if (outcome.status === 'needs_owner') {
      await pauseForOwner({
        scopeId: thread.scopeId,
        requesterPhone: thread.requesterPhone,
        inboundType: thread.inboundType,
        originalMessageAr: thread.originalMessageAr,
        intent,
        agentText,
        ownerQuestionAr: outcome.messageArToOwner || agentText,
        modelSlug,
        existingThread: thread,
      })
      return { ok: true, threadId: thread.id }
    }

    await finalizeDone({
      thread,
      scopeId: thread.scopeId,
      requesterPhone: thread.requesterPhone,
      inboundType: thread.inboundType,
      originalMessageAr: thread.originalMessageAr,
      intent,
      agentText,
      modelSlug,
      messageArToRequester:
        outcome.messageArToRequester ||
        `تم — ${agentText.slice(0, 800)}`,
      messageArToOwner:
        outcome.messageArToOwner ||
        `اكتملت معالجة طلب واتساب من ${thread.requesterPhone}`,
    })
    return { ok: true, threadId: thread.id }
  } catch (e) {
    await updateInboxThread(thread.id, { status: 'pending_owner' })
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'تعذّر استئناف الطلب',
    }
  }
}

/** Parse room command: رد واتساب: … or رد على واتساب #id: … */
export function parseWhatsAppOwnerRoomCommand(raw: string): {
  threadId?: string
  answerAr: string
} | null {
  const trimmed = raw.trim()
  const m = trimmed.match(
    /^رد\s*(?:على\s+)?واتساب(?:\s*#([a-zA-Z0-9-]+))?\s*[:：]\s*([\s\S]+)$/u
  )
  if (!m) return null
  return {
    threadId: m[1] || undefined,
    answerAr: m[2].trim(),
  }
}
