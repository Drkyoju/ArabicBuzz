import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy'
import { streamText, stepCountIs, type ToolSet } from 'ai'
import {
  lookupChannelBinding,
  resolveChannelScope,
  upsertChannelBinding,
} from '@/lib/channels/bindings'
import { resolveChannelOwnerUserIdAsync } from '@/lib/channels/owner-context'
import { DEMO_SCOPES, resolveActiveScope } from '@/lib/scopes/manager'
import { getNativeAiTools } from '@/lib/agents/engine'
import { getHarnessModel } from '@/lib/ai/router'
import { getMCPHostManager } from '@/lib/mcp/client-manager'
import { connectEnvMcpServers } from '@/lib/mcp/host-client'
import { normalizeArabicPrompt } from '@/lib/ai/dialect-parser'
import { resolveApproval, listPendingApprovals } from '@/lib/agents/resolve-approval'
import { updateApprovalInSupabase } from '@/lib/supabase/server'
import { mirrorChannelTurnToRoom } from '@/lib/rooms/channel-mirror'
import {
  extractFromAgentSteps,
  extractCitationsFromToolOutput,
  extractPausedApprovalId,
  formatCitationsFooterAr,
} from '@/lib/agents/citation-events'
import { buildScopedSystemPrompt } from '@/lib/skills/registry'
import {
  ARABIC_AUTHZ_ERROR,
  AuthorizationError,
} from '@/lib/auth/rbac'
import type { RoomCitation } from '@/lib/scopes/types'
import { transcribeArabicSpeech } from '@/lib/audio/transcribe'
import { generateArabicAudioBuffer } from '@/lib/audio/tts'
import {
  shouldReplyWithTelegramVoice,
  clipForTelegramTts,
} from '@/lib/telegram/voice-reply'
import {
  buildVoiceQuickKeyboard,
  rememberVoiceTranscript,
  takeVoiceTranscript,
  parseVoiceQuickCallback,
  voiceQuickPrompt,
  formatVoiceSttSummaryAr,
  VOICE_QUICK_HINT_AR,
} from '@/lib/telegram/voice-quick'
import {
  extractAttachmentsFromToolOutput,
  ingestTelegramDocumentToWorkspace,
  ingestTelegramPhotoToWorkspace,
  isTrivialGroupMessage,
  sendAttachmentsToTelegramChat,
  type TelegramAttachmentRef,
} from '@/lib/telegram/media'
import { saveWorkspaceFile } from '@/lib/documents/workspace'
import { formatDownloadMarker } from '@/lib/files/file-markers'
import {
  classifyTelegramFastPath,
  isHeavyTelegramPrompt,
  runTelegramFastPath,
  shouldNormalizeTelegramDialect,
} from '@/lib/telegram/fast-path'
import { claimTelegramUpdate } from '@/lib/telegram/update-dedupe'
import {
  routeAssistantIntent,
  runAssistant,
} from '@/lib/assistants'
import {
  TELEGRAM_SITE_CHAT_TOOLS,
  TELEGRAM_SITE_HEAVY_TOOLS,
  TELEGRAM_LIMITS_SYSTEM_AR,
  buildTelegramPowerPrompt,
  classifyTelegramWorkIntent,
  markTelegramSeatBusy,
  markTelegramSeatFree,
  telegramEffortMaxSteps,
  telegramGoogleLinkedHintAr,
} from '@/lib/telegram/power-path'
import { effortToRunParams } from '@/lib/ai/run-effort'
import { parseTelegramMessageIntent } from '@/lib/telegram/message-intent'
import {
  deliverGroupBroadcast,
  deliverNamedTelegramMessage,
  rememberTelegramPeer,
} from '@/lib/telegram/peer-directory'
import { formatTelegramErrorAr } from '@/lib/telegram/errors-ar'

function pickToolSubset(all: ToolSet, names: readonly string[]): ToolSet {
  const out: ToolSet = {}
  for (const name of names) {
    if (all[name]) out[name] = all[name]
  }
  return out
}

function resolveTelegramModelSlug(
  heavy: boolean,
  preferred?: string | null
): string {
  if (preferred?.trim()) return preferred.trim()
  if (heavy) {
    return (
      process.env.TELEGRAM_HEAVY_MODEL?.trim() ||
      process.env.DEFAULT_HARNESS_MODEL?.trim() ||
      'gemini-3.1-pro'
    )
  }
  return (
    process.env.TELEGRAM_HARNESS_MODEL?.trim() ||
    'gemini-2.5-flash'
  )
}

let bot: Bot | null = null
let botInitPromise: Promise<void> | null = null
let commandsRegistered = false

const TELEGRAM_AGENT_SYSTEM = `أنت وكيل Arabic Buzz عبر تيليجرام — هذه القناة = غرفة الفريق على الموقع (نفس الأدوات والمقاعد).
- افهم العربية الفصحى والعامية السعودية/الخليجية؛ أعد صياغة القصد داخلياً وأجب بالفصحى المهنية الموجزة.
- لا تنتظر أوامر مثل /ask — أي طلب عمل عادي يُنفَّذ مباشرة بعد /link.
- أيقظ وكيل١ (ثم ٢ عند الانشغال) ونفّذ كما في غرفة الموقع: ملفات، Drive، تحويل، تقويم، مهام، بريد إن وُجد، بحث، تبليغ أعضاء.
- إن عجزت وحدك عن جزء: استخدم أدوات الغرفة نفسها (نفس pipeline الموقع) وأعد النتيجة هنا مع المرفقات.
- أجب بإيجاز. للأسئلة البسيطة أجب مباشرة دون أدوات إن أمكن.
- التقويم: مصدر الفريق هو room_calendar_* فقط. اعرض الأوقات بتوقيت السعودية (Asia/Riyadh) مرة واحدة — لا تذكر UTC.
- لطلب موعد جديد: room_calendar_create فوراً ثم أكّد.
- الملفات: list_workspace_files / search_knowledge_base → brain_open_document → read/edit/convert → return_file (يُرسل كمرفق هنا).
- صور / PDF ممسوح: arabic_ocr. عقل الشركة: search_knowledge_base / brain_* — لا drive_sync_brain إلا بطلب مزامنة صريح.
- «أرسل لفلان» / تنسيق / تبليغ: notify_room_member فوراً. خاص فقط إن بدأ المستلم البوت؛ وإلا المجموعة المربوطة — اشرح بصراحة.
- للإجراءات عالية المخاطر (الحذف فقط) اطلب موافقة بشرية. لا تختلق لوائح أو قرارات.
${TELEGRAM_LIMITS_SYSTEM_AR}`

async function ensureTelegramBotReady(): Promise<Bot> {
  const instance = getTelegramBot()
  if (!botInitPromise) {
    botInitPromise = instance.init().then(() => undefined)
  }
  try {
    await botInitPromise
  } catch (e) {
    botInitPromise = null
    throw e
  }
  return instance
}

async function ensureBotCommands(instance: Bot) {
  if (commandsRegistered) return
  try {
    await instance.api.setMyCommands([
      { command: 'link', description: 'ربط المجموعة/اللجنة بغرفة الموقع' },
      { command: 'start', description: 'بدء الربط أو إظهار المعرّف' },
      { command: 'help', description: 'شرح الاستخدام بدون أوامر' },
      { command: 'status', description: 'حالة الربط' },
      { command: 'rooms', description: 'المساحة المربوطة' },
      { command: 'approve', description: 'الموافقات المعلّقة' },
      { command: 'ask', description: 'اختياري — نفس الكتابة العادية' },
    ])
    commandsRegistered = true
  } catch (e) {
    console.error('[telegram] setMyCommands', e)
  }
}

function resolveTelegramScope(opts: {
  chatId: string
  userId: string
  preferredScopeId?: string
  /** Groups: false until /link creates a binding */
  autoBind?: boolean
}) {
  if (opts.preferredScopeId) {
    return Promise.resolve(
      resolveActiveScope({
        userId: opts.userId,
        scopeId: opts.preferredScopeId,
        scopes: DEMO_SCOPES,
      })
    )
  }
  return resolveChannelScope({
    channel: 'telegram',
    externalId: opts.chatId,
    fallbackUserId: opts.userId,
    autoBind: opts.autoBind,
  }).then((scope) => {
    if (scope) return scope
    if (opts.autoBind === false) return null
    return resolveActiveScope({
      userId: opts.userId,
      scopeId: process.env.TELEGRAM_DEFAULT_SCOPE_ID || 'shared-demo',
      scopes: DEMO_SCOPES,
    })
  })
}

function isGroupChat(chat: { type?: string } | undefined): boolean {
  return chat?.type === 'group' || chat?.type === 'supergroup'
}

/** Parse /cmd[@bot] optional args — Telegram group form requires @bot often. */
function matchBotCommand(
  text: string,
  names: string
): { cmd: string; botTag: string; args: string } | null {
  const re = new RegExp(
    `^\\/(${names})(?:@(\\w+))?(?:\\s+([\\s\\S]*))?$`,
    'i'
  )
  const m = text.trim().match(re)
  if (!m) return null
  return {
    cmd: (m[1] || '').toLowerCase(),
    botTag: (m[2] || '').toLowerCase(),
    args: (m[3] || '').trim(),
  }
}

function stripBotMention(
  text: string,
  botUsername: string
): { mentioned: boolean; text: string } {
  const uname = botUsername.replace(/^@/, '').trim()
  if (!uname) return { mentioned: false, text }
  const re = new RegExp(`@${uname}\\b`, 'gi')
  const mentioned = re.test(text)
  return { mentioned, text: text.replace(re, '').replace(/\s+/g, ' ').trim() }
}

/** /cmd@OtherBot must be ignored; /cmd or /cmd@us is for us. */
function commandForThisBot(
  botTag: string | undefined,
  botUsername: string
): boolean {
  if (!botTag) return true
  if (!botUsername) return true
  return botTag.toLowerCase() === botUsername.replace(/^@/, '').toLowerCase()
}

/**
 * Linked group (after /link): every substantive message is an agent turn.
 * Unlinked group: only @mention / reply-to-bot (to nudge /link) — not free chat.
 * Privacy Mode ON: Telegram only delivers commands, mentions, replies anyway.
 */
function shouldHandleGroupText(opts: {
  rawText: string
  botUsername: string
  isReplyToBot: boolean
  isCommand: boolean
  isLinked: boolean
}): { handle: boolean; promptText: string; viaMention: boolean; needLink: boolean } {
  const { mentioned, text: stripped } = stripBotMention(
    opts.rawText,
    opts.botUsername
  )
  if (opts.isCommand) {
    return {
      handle: true,
      promptText: stripped || opts.rawText,
      viaMention: false,
      needLink: false,
    }
  }
  if (opts.isLinked) {
    if (isTrivialGroupMessage(opts.rawText) && !mentioned && !opts.isReplyToBot) {
      return { handle: false, promptText: '', viaMention: mentioned, needLink: false }
    }
    return {
      handle: true,
      promptText: stripped || opts.rawText.trim(),
      viaMention: mentioned,
      needLink: false,
    }
  }
  // Unlinked: only when addressed
  if (mentioned || opts.isReplyToBot) {
    return {
      handle: true,
      promptText: stripped || opts.rawText.trim(),
      viaMention: mentioned,
      needLink: true,
    }
  }
  return { handle: false, promptText: '', viaMention: false, needLink: false }
}

function privacyHintAr(botUsername: string): string {
  const tag = botUsername ? `@${botUsername}` : 'البوت'
  return [
    'مهم — ليرى البوت كل الرسائل العادية (بدون /ask):',
    'BotFather → اختر البوت → Bot Settings → Group Privacy → Disable',
    `بعدها اكتب بالعربية العادية في المجموعة — مثل الموقع. منشن ${tag} اختياري إذا بقيت الخصوصية مفعّلة.`,
  ].join('\n')
}

/** Inline keyboard: ✅ موافقة / ❌ رفض with approve_/reject_ callback data. */
export function buildApprovalKeyboard(actionId: string) {
  return new InlineKeyboard()
    .text('✅ موافقة', 'approve_' + actionId)
    .text('❌ رفض', 'reject_' + actionId)
}

async function maybeSendTelegramVoiceReply(ctx: Context, text: string) {
  if (!shouldReplyWithTelegramVoice(text)) return
  try {
    const audioOut = await generateArabicAudioBuffer(clipForTelegramTts(text))
    await ctx.replyWithVoice(new InputFile(audioOut, 'reply.ogg'))
  } catch {
    /* TTS optional / cheap path may fail without keys */
  }
}

async function bindTelegramTools(opts: {
  requesterId: string
  scopeId: string
  heavy: boolean
  /** Full room tool surface (same as /api/chat) — default for work turns. */
  fullRoom?: boolean
}): Promise<ToolSet> {
  const { parsePosture } = await import('@/lib/security/posture')
  const native = getNativeAiTools({
    requesterId: opts.requesterId,
    scopeId: opts.scopeId,
    mode: parsePosture('DANGEROUS'),
  })
  // Parity with غرفة الفريق: full native toolset for work; subset only for light chat.
  const subset = opts.fullRoom
    ? native
    : pickToolSubset(
        native,
        opts.heavy ? TELEGRAM_SITE_HEAVY_TOOLS : TELEGRAM_SITE_CHAT_TOOLS
      )

  // MCP env connect is slow on cold start — opt-in only for Telegram.
  if (process.env.TELEGRAM_INCLUDE_MCP === '1') {
    try {
      await connectEnvMcpServers()
      const mcpTools = await getMCPHostManager().getCombinedToolSet()
      return { ...subset, ...mcpTools }
    } catch {
      /* optional */
    }
  }
  return subset
}

async function streamTelegramReply(opts: {
  ctx: Context
  prompt: string
  system: string
  modelSlug: string
  requesterId: string
  scopeId: string
  maxSteps: number
  tools: ToolSet
  /** Pre-sent ack message to edit into the final reply. */
  placeholderMessageId?: number
}): Promise<{
  text: string
  citations: RoomCitation[]
  pendingApprovalIds: string[]
  attachmentsSent: string[]
}> {
  await opts.ctx.replyWithChatAction('typing')
  let placeholderId = opts.placeholderMessageId
  if (!placeholderId) {
    const placeholder = await opts.ctx.reply('جاري…')
    placeholderId = placeholder.message_id
  }

  const citations: RoomCitation[] = []
  const pendingApprovalIds: string[] = []
  const attachmentBucket: TelegramAttachmentRef[] = []
  let assembled = ''
  let lastEdit = 0
  /** Fewer Telegram API round-trips during stream (was 1s). */
  const editThrottleMs = 2500

  const result = streamText({
    model: getHarnessModel(opts.modelSlug),
    system: opts.system,
    prompt: opts.prompt,
    tools: opts.tools,
    stopWhen: stepCountIs(opts.maxSteps),
  })

  try {
    for await (const part of result.fullStream) {
      const p = part as {
        type?: string
        textDelta?: string
        delta?: string
        output?: unknown
        result?: unknown
      }
      if (
        p.type === 'text-delta' ||
        typeof p.textDelta === 'string' ||
        typeof p.delta === 'string'
      ) {
        assembled += String(p.textDelta ?? p.delta ?? '')
        const now = Date.now()
        if (now - lastEdit > editThrottleMs && assembled.trim()) {
          lastEdit = now
          try {
            await opts.ctx.api.editMessageText(
              opts.ctx.chat!.id,
              placeholderId,
              assembled.slice(0, 3900)
            )
          } catch {
            /* ignore edit races */
          }
        }
      }
      if (p.type === 'tool-result' || p.output !== undefined || p.result !== undefined) {
        const out = p.output ?? p.result
        for (const c of extractCitationsFromToolOutput(out)) {
          if (!citations.some((x) => x.labelAr === c.labelAr)) citations.push(c)
        }
        const aid = extractPausedApprovalId(out)
        if (aid && !pendingApprovalIds.includes(aid)) pendingApprovalIds.push(aid)
        for (const a of extractAttachmentsFromToolOutput(out, opts.scopeId)) {
          if (!attachmentBucket.some((x) => x.fileId === a.fileId)) {
            attachmentBucket.push(a)
          }
        }
      }
    }
  } catch (e) {
    console.error('[telegram] stream', e)
  }

  const finalText = (await result.text)?.trim() || assembled.trim()
  const steps = await result.steps
  const stepsExtract = extractFromAgentSteps(steps)
  for (const c of stepsExtract.citations) {
    if (!citations.some((x) => x.labelAr === c.labelAr)) citations.push(c)
  }
  for (const id of stepsExtract.pendingApprovalIds) {
    if (!pendingApprovalIds.includes(id)) pendingApprovalIds.push(id)
  }
  for (const step of steps) {
    const toolResults = (
      step as { toolResults?: Array<{ result?: unknown; output?: unknown }> }
    ).toolResults
    if (!Array.isArray(toolResults)) continue
    for (const tr of toolResults) {
      const out = tr.result ?? tr.output
      for (const a of extractAttachmentsFromToolOutput(out, opts.scopeId)) {
        if (!attachmentBucket.some((x) => x.fileId === a.fileId)) {
          attachmentBucket.push(a)
        }
      }
    }
  }

  const body =
    (finalText || 'تم استلام رسالتك، لكن لم يُنتَج رد نصي.') +
    formatCitationsFooterAr(citations)

  const firstApproval = pendingApprovalIds[0]
  try {
    await opts.ctx.api.editMessageText(
      opts.ctx.chat!.id,
      placeholderId,
      body.slice(0, 4000),
      firstApproval
        ? { reply_markup: buildApprovalKeyboard(firstApproval) }
        : undefined
    )
  } catch {
    await opts.ctx.reply(
      body.slice(0, 4000),
      firstApproval
        ? { reply_markup: buildApprovalKeyboard(firstApproval) }
        : undefined
    )
  }

  for (const id of pendingApprovalIds.slice(1, 4)) {
    await opts.ctx.reply(`موافقة مطلوبة أيضاً (#${id.slice(0, 8)})`, {
      reply_markup: buildApprovalKeyboard(id),
    })
  }

  const attachmentsSent = await sendAttachmentsToTelegramChat({
    ctx: opts.ctx,
    attachments: attachmentBucket,
  })

  return { text: body, citations, pendingApprovalIds, attachmentsSent }
}

async function runTelegramAgentTurn(opts: {
  ctx: Context
  promptSource: string
  chatId: string
  userId: string
  scope: NonNullable<Awaited<ReturnType<typeof resolveTelegramScope>>>
  /** Document/photo path — use heavier model + more tools/steps. */
  forceHeavy?: boolean
  /** Optional label shown after STT (موعد/مهمة/ملف…). */
  workLabelAr?: string
}) {
  const t0 = Date.now()
  const scopeId = opts.scope.scope.id
  const classified = classifyTelegramWorkIntent(opts.promptSource)
  const work = {
    ...classified,
    forceHeavy: Boolean(opts.forceHeavy) || classified.forceHeavy,
    preferFullAgent: Boolean(opts.forceHeavy) || classified.preferFullAgent,
  }

  const powered = buildTelegramPowerPrompt({
    raw: opts.promptSource,
    scopeId,
    work,
  })
  const seatId = powered.wakeAgent?.id

  // Ack immediately so group UX feels responsive while we prep.
  void opts.ctx.replyWithChatAction('typing').catch(() => undefined)
  const ackBits = ['⏳ جاري العمل…']
  if (powered.wakeNoticeAr) ackBits.push(powered.wakeNoticeAr)
  else if (powered.wakeAgent) {
    ackBits.push(`أُيقظ ${powered.wakeAgent.nameAr} في غرفة الموقع`)
  }
  if (opts.workLabelAr || work.kind !== 'casual') {
    ackBits.push(`القصد: ${opts.workLabelAr || work.labelAr}`)
  }
  if (work.kind === 'file' || work.forceHeavy) {
    ackBits.push('أدوات كاملة مثل الموقع (ملفات/Drive/تحويل)')
  }
  const ack = await opts.ctx.reply(ackBits.join('\n'))

  if (seatId) markTelegramSeatBusy(scopeId, seatId)

  try {
  // Deterministic «أرسل لفلان» / بث المجموعة — قبل الوكيل
  const msgIntent = parseTelegramMessageIntent(opts.promptSource)
  if (msgIntent && work.kind === 'message') {
    try {
      const fromLabelAr = opts.ctx.from?.first_name || undefined
      const groupChatId = opts.chatId.startsWith('-') ? opts.chatId : null
      const result =
        msgIntent.kind === 'broadcast'
          ? groupChatId
            ? await deliverGroupBroadcast({
                scopeId,
                textAr: msgIntent.bodyAr,
                groupChatId,
                fromLabelAr,
              })
            : {
                ok: false as const,
                via: 'none' as const,
                messageAr:
                  'للبث للمجموعة أرسل من داخل المجموعة المربوطة بـ /link، أو حدد عضواً بالاسم.',
              }
          : await deliverNamedTelegramMessage({
              scopeId,
              targetNameAr: msgIntent.targetNameAr,
              textAr: msgIntent.bodyAr,
              groupChatId,
              fromLabelAr,
            })
      const text = [result.messageAr, result.limitsAr].filter(Boolean).join('\n')
      try {
        await opts.ctx.api.editMessageText(
          opts.ctx.chat!.id,
          ack.message_id,
          text.slice(0, 4000)
        )
      } catch {
        try {
          await opts.ctx.api.deleteMessage(opts.ctx.chat!.id, ack.message_id)
        } catch {
          /* ignore */
        }
        await opts.ctx.reply(text.slice(0, 4000))
      }
      void mirrorChannelTurnToRoom({
        scopeId,
        channel: 'telegram',
        externalId: opts.chatId,
        userLabelAr: opts.ctx.from?.first_name || 'مستخدم تيليجرام',
        userMessageAr: opts.promptSource,
        agentReplyAr: text,
      })
      await maybeSendTelegramVoiceReply(opts.ctx, text)
      return {
        text,
        citations: [] as RoomCitation[],
        pendingApprovalIds: [] as string[],
        attachmentsSent: [] as string[],
      }
    } catch (e) {
      console.error('[telegram] message-path', e)
      /* fall through to full agent */
    }
  }

  const fastKind = classifyTelegramFastPath(opts.promptSource)
  if (
    fastKind &&
    !opts.forceHeavy &&
    work.kind !== 'appointment' &&
    work.kind !== 'file' &&
    work.kind !== 'message' &&
    work.kind !== 'task'
  ) {
    try {
      const text = await runTelegramFastPath({
        kind: fastKind,
        scopeId,
        userFirstName: opts.ctx.from?.first_name,
        rawPrompt: opts.promptSource,
      })
      try {
        await opts.ctx.api.editMessageText(opts.ctx.chat!.id, ack.message_id, text)
      } catch {
        // Avoid leaving «جاري…» + a second final — replace via delete+reply once.
        try {
          await opts.ctx.api.deleteMessage(opts.ctx.chat!.id, ack.message_id)
        } catch {
          /* ignore */
        }
        await opts.ctx.reply(text)
      }
      void mirrorChannelTurnToRoom({
        scopeId,
        channel: 'telegram',
        externalId: opts.chatId,
        userLabelAr: opts.ctx.from?.first_name || 'مستخدم تيليجرام',
        userMessageAr: opts.promptSource,
        agentReplyAr: text,
      })
      console.info('[telegram] timing', {
        path: 'fast',
        kind: fastKind,
        totalMs: Date.now() - t0,
      })
      await maybeSendTelegramVoiceReply(opts.ctx, text)
      return {
        text,
        citations: [] as RoomCitation[],
        pendingApprovalIds: [] as string[],
        attachmentsSent: [] as string[],
      }
    } catch (e) {
      console.error('[telegram] fast-path', e)
      /* fall through to agent — still one final via the same ack placeholder */
    }
  }

  // Specialized assistants (mail / day-captain) — skip for file/appointment/task
  // so we keep room tools + Telegram file attachments.
  const routed =
    !opts.forceHeavy && !work.preferFullAgent
      ? routeAssistantIntent(opts.promptSource)
      : null
  if (
    routed &&
    routed.matchedBy !== 'default' &&
    routed.assistantId !== 'file-office' &&
    routed.assistantId !== 'file-search'
  ) {
    try {
      const requesterId = await resolveChannelOwnerUserIdAsync(opts.userId)
      const run = await runAssistant({
        assistantId: routed.assistantId,
        message: powered.prompt,
        scopeId,
        requesterId,
        skipRequirementCheck: false,
        effortLevel: powered.adapt.effort,
        modelSlug: powered.adapt.modelSlug,
      })
      let text =
        run.blocked?.messageAr ||
        run.text ||
        'لم يُرجع المساعد نصاً.'
      const driveHint = await telegramGoogleLinkedHintAr(requesterId)
      if (driveHint && /drive|درايف|عقل|brain|google/i.test(opts.promptSource)) {
        text = `${text}\n\n${driveHint}`
      }
      try {
        await opts.ctx.api.editMessageText(
          opts.ctx.chat!.id,
          ack.message_id,
          text.slice(0, 4000)
        )
      } catch {
        try {
          await opts.ctx.api.deleteMessage(opts.ctx.chat!.id, ack.message_id)
        } catch {
          /* ignore */
        }
        await opts.ctx.reply(text.slice(0, 4000))
      }
      const attachmentsSent = await sendAttachmentsToTelegramChat({
        ctx: opts.ctx,
        attachments: (run.attachments || []).map((a) => ({
          fileId: a.fileId,
          name: a.name,
          mimeType: a.mimeType,
          scopeId: a.scopeId || scopeId,
        })),
        captionAr: '📎 ناتج العمل',
      })
      if (run.pendingApprovalIds?.length) {
        for (const id of run.pendingApprovalIds.slice(0, 3)) {
          await opts.ctx.reply(`موافقة حذف مطلوبة (#${id.slice(0, 8)})`, {
            reply_markup: buildApprovalKeyboard(id),
          })
        }
      }
      void mirrorChannelTurnToRoom({
        scopeId,
        channel: 'telegram',
        externalId: opts.chatId,
        userLabelAr: opts.ctx.from?.first_name || 'مستخدم تيليجرام',
        userMessageAr: opts.promptSource,
        agentReplyAr: text,
      })
      console.info('[telegram] timing', {
        path: 'assistant',
        assistantId: routed.assistantId,
        totalMs: Date.now() - t0,
      })
      await maybeSendTelegramVoiceReply(opts.ctx, text)
      return {
        text,
        citations: run.citations || [],
        pendingApprovalIds: run.pendingApprovalIds || [],
        attachmentsSent,
      }
    } catch (e) {
      console.error('[telegram] assistant-path', e)
      /* fall through to default agent */
    }
  }

  const heavy =
    Boolean(opts.forceHeavy) ||
    work.forceHeavy ||
    work.kind === 'file' ||
    work.kind === 'question' ||
    isHeavyTelegramPrompt(opts.promptSource)
  const useFullRoomTools =
    work.kind !== 'casual' || heavy || Boolean(opts.forceHeavy)
  const modelSlug = resolveTelegramModelSlug(heavy, powered.adapt.modelSlug)
  const maxSteps = telegramEffortMaxSteps(
    powered.adapt.effort,
    heavy || useFullRoomTools
  )
  const needDialect = shouldNormalizeTelegramDialect(opts.promptSource)
  const effortHint = effortToRunParams(powered.adapt.effort).systemHintAr

  const tPrep = Date.now()
  const [normalized, requesterId, systemBase] = await Promise.all([
    normalizeArabicPrompt(powered.prompt, {
      skip: !needDialect,
      modelSlug: needDialect
        ? process.env.TELEGRAM_DIALECT_MODEL?.trim() || 'gemini-2.5-flash'
        : undefined,
    }),
    resolveChannelOwnerUserIdAsync(opts.userId),
    buildScopedSystemPrompt(
      `${TELEGRAM_AGENT_SYSTEM}\n\n${effortHint}`,
      opts.scope
    ),
  ])
  const driveHint = await telegramGoogleLinkedHintAr(requesterId)
  const system = driveHint
    ? `${systemBase}\n\n${driveHint}`
    : systemBase
  const tools = await bindTelegramTools({
    requesterId,
    scopeId,
    heavy,
    fullRoom: useFullRoomTools,
  })
  const prepMs = Date.now() - tPrep
  const tStream = Date.now()

  const out = await streamTelegramReply({
    ctx: opts.ctx,
    prompt: normalized.normalizedPromptAr,
    system,
    modelSlug,
    requesterId,
    scopeId,
    maxSteps,
    tools,
    placeholderMessageId: ack.message_id,
  })

  console.info('[telegram] timing', {
    path: 'agent',
    heavy,
    work: work.kind,
    seat: powered.wakeAgent?.slug,
    model: modelSlug,
    dialect: needDialect,
    maxSteps,
    toolCount: Object.keys(tools).length,
    prepMs,
    streamMs: Date.now() - tStream,
    totalMs: Date.now() - t0,
  })

  void mirrorChannelTurnToRoom({
    scopeId,
    channel: 'telegram',
    externalId: opts.chatId,
    userLabelAr: opts.ctx.from?.first_name || 'مستخدم تيليجرام',
    userMessageAr: opts.promptSource,
    agentReplyAr: out.text,
  })

  await maybeSendTelegramVoiceReply(opts.ctx, out.text)
  return out
  } finally {
    if (seatId) markTelegramSeatFree(scopeId, seatId)
  }
}

export function getTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')
  if (bot) return bot

  bot = new Bot(token)
  void ensureBotCommands(bot)

  bot.on('my_chat_member', async (ctx) => {
    try {
      const status = ctx.myChatMember.new_chat_member.status
      if (status !== 'member' && status !== 'administrator') return
      if (!isGroupChat(ctx.chat)) return
      const chatId = String(ctx.chat.id)
      const botTag = ctx.me.username ? `@${ctx.me.username}` : 'البوت'
      const defaultScope =
        process.env.TELEGRAM_DEFAULT_SCOPE_ID?.trim() || 'shared-demo'
      await ctx.reply(
        [
          'مرحباً — بوت Arabic Buzz انضم للمجموعة.',
          `معرّف المجموعة: ${chatId}`,
          '',
          '① اربط الغرفة مرة واحدة:',
          `/link@${ctx.me.username || 'bot'} scope_${defaultScope}`,
          'أو فقط: /link',
          '',
          '② بعدها اكتب بالعربية العادية — بدون /ask.',
          `من ينادي ${botTag} أو يكتب طلباً واضحاً يشتغل الوكيل مثل الموقع.`,
          '',
          privacyHintAr(ctx.me.username || ''),
          'اجعل البوت مشرفاً إن مُنِع الأعضاء من الإرسال، واسمح بإرسال الوسائط.',
        ].join('\n')
      )
    } catch (e) {
      console.error('[telegram] my_chat_member', e)
    }
  })

  bot.on('message:text', async (ctx) => {
    if (ctx.from?.is_bot) return

    const chatId = String(ctx.chat.id)
    const userId = String(ctx.from?.id || 'user-1')
    const rawText = ctx.message.text || ''
    const cmd = rawText.trim()
    const inGroup = isGroupChat(ctx.chat)
    const botUsername = ctx.me.username || ''
    const isReplyToBot = Boolean(
      ctx.message.reply_to_message?.from?.id &&
        ctx.message.reply_to_message.from.id === ctx.me.id
    )

    const bindRaw = matchBotCommand(cmd, 'start|link|owner|معرف|id')
    const helpRaw = matchBotCommand(cmd, 'help')
    const statusRaw = matchBotCommand(cmd, 'status')
    const roomsRaw = matchBotCommand(cmd, 'rooms')
    const approveRaw = matchBotCommand(cmd, 'approve')
    const askRaw = matchBotCommand(cmd, 'ask')
    const bindCmd =
      bindRaw && commandForThisBot(bindRaw.botTag, botUsername) ? bindRaw : null
    const helpCmd =
      helpRaw && commandForThisBot(helpRaw.botTag, botUsername) ? helpRaw : null
    const statusCmd =
      statusRaw && commandForThisBot(statusRaw.botTag, botUsername)
        ? statusRaw
        : null
    const roomsCmd =
      roomsRaw && commandForThisBot(roomsRaw.botTag, botUsername)
        ? roomsRaw
        : null
    const approveCmd =
      approveRaw && commandForThisBot(approveRaw.botTag, botUsername)
        ? approveRaw
        : null
    const askCmd =
      askRaw && commandForThisBot(askRaw.botTag, botUsername) ? askRaw : null
    const isKnownCommand = Boolean(
      bindCmd || helpCmd || statusCmd || roomsCmd || approveCmd || askCmd
    )

    if (
      cmd.startsWith('/') &&
      (bindRaw || helpRaw || statusRaw || roomsRaw || approveRaw || askRaw) &&
      !isKnownCommand
    ) {
      return
    }

    const existingBinding = inGroup
      ? await lookupChannelBinding({
          channel: 'telegram',
          externalId: chatId,
        })
      : null
    const isLinked = Boolean(existingBinding) || !inGroup

    if (inGroup && !isKnownCommand) {
      const gate = shouldHandleGroupText({
        rawText: cmd,
        botUsername,
        isReplyToBot,
        isCommand: cmd.startsWith('/'),
        isLinked: Boolean(existingBinding),
      })
      if (cmd.startsWith('/') && !isKnownCommand) {
        const other = matchBotCommand(cmd, '\\w+')
        if (
          other?.botTag &&
          botUsername &&
          other.botTag !== botUsername.toLowerCase()
        ) {
          return
        }
        if (!gate.viaMention && !isReplyToBot) return
      }
      if (!gate.handle) return

      if (gate.needLink) {
        await ctx.reply(
          [
            'هذه المجموعة غير مربوطة بغرفة Arabic Buzz بعد.',
            `أرسل: /link@${botUsername || 'bot'}`,
            'بعد الربط اكتب بالعربية العادية — بدون /ask.',
            '',
            privacyHintAr(botUsername),
          ].join('\n')
        )
        return
      }
    }

    await ctx.replyWithChatAction('typing')

    const scope = await resolveTelegramScope({
      chatId,
      userId,
      autoBind: !inGroup || Boolean(bindCmd) || isLinked,
    })
    if (!scope) {
      if (inGroup) {
        await ctx.reply(
          [
            'اربط المجموعة أولاً:',
            `/link@${botUsername || 'bot'}`,
            '',
            privacyHintAr(botUsername),
          ].join('\n')
        )
      } else {
        await ctx.reply('عفواً، تعذّر ربط هذه المحادثة بنطاق عمل.')
      }
      return
    }

    if (bindCmd || !inGroup) {
      void upsertChannelBinding({
        channel: 'telegram',
        externalId: chatId,
        scopeId: scope.scope.id,
        userId,
      })
    } else if (existingBinding) {
      void upsertChannelBinding({
        channel: 'telegram',
        externalId: chatId,
        scopeId: existingBinding.scopeId,
        userId,
      })
    }

    if (bindCmd) {
      const payload = bindCmd.args.split(/\s+/)[0] || ''
      let boundScopeId = scope.scope.id
      let boundName = scope.scope.nameAr
      const {
        parseCommitteeStartPayload,
        upsertCommitteeChannel,
        COMMITTEE_LABELS_AR,
        COMMITTEE_KEYS,
      } = await import('@/lib/rooms/committee-channels')

      // Bare /link — explain multi-committee options
      if (!payload && bindCmd.cmd === 'link') {
        const defaultScope =
          process.env.TELEGRAM_DEFAULT_SCOPE_ID?.trim() || 'shared-demo'
        const tag = botUsername ? `@${botUsername}` : ''
        await upsertChannelBinding({
          channel: 'telegram',
          externalId: chatId,
          scopeId: boundScopeId,
          userId,
        })
        await ctx.reply(
          [
            'تم ربط هذه المحادثة بالغرفة الافتراضية.',
            `المساحة: ${boundName} (${boundScopeId})`,
            `معرّف المحادثة: ${chatId}`,
            '',
            'عدة لجان؟ كل مجموعة تربط لوحدها:',
            `/link${tag} scope_${defaultScope}`,
            `/link${tag} scope_${defaultScope}__c_finance — اللجنة المالية`,
            `/link${tag} scope_${defaultScope}__c_programs — لجنة البرامج`,
            `/link${tag} scope_${defaultScope}__c_board — مجلس الإدارة`,
            'أو اختصار داخل المجموعة: /link finance | programs | board',
            '',
            inGroup
              ? [
                  'اكتب بالعربية العادية — بدون /ask.',
                  privacyHintAr(botUsername),
                ].join('\n')
              : 'أضِف TELEGRAM_OWNER_CHAT_ID على CranL إن أردت تثبيت مالك التنبيهات.',
          ].join('\n')
        )
        return
      }

      if (payload) {
        // Shorthand: /link finance|programs|board → current/default scope + committee
        const shorthand = payload.toLowerCase()
        let parsed = parseCommitteeStartPayload(payload)
        if (
          !parsed?.committeeKey &&
          (COMMITTEE_KEYS as readonly string[]).includes(shorthand)
        ) {
          parsed = {
            scopeId: boundScopeId,
            committeeKey: shorthand as (typeof COMMITTEE_KEYS)[number],
          }
        }
        const scopeId = parsed?.scopeId || payload.replace(/^scope[_-]/i, '')
        const resolved = await resolveTelegramScope({
          chatId,
          userId,
          preferredScopeId: scopeId,
          autoBind: true,
        }).catch(() => null)
        if (resolved?.scope?.id) {
          boundScopeId = resolved.scope.id
          boundName = resolved.scope.nameAr
          await upsertChannelBinding({
            channel: 'telegram',
            externalId: chatId,
            scopeId: boundScopeId,
            userId,
          })
          if (parsed?.committeeKey) {
            await upsertCommitteeChannel({
              scopeId: boundScopeId,
              committeeKey: parsed.committeeKey,
              chatId,
            })
            await ctx.reply(
              [
                'مرحباً — بوت Arabic Buzz جاهز.',
                `رُبطت قناة «${COMMITTEE_LABELS_AR[parsed.committeeKey]}» بالغرفة: ${boundName}`,
                `معرّف المحادثة: ${chatId}`,
                'يمكن ربط مجموعات لجان أخرى بنفس الغرفة — كل مجموعة /link خاص بها.',
                inGroup
                  ? 'اكتب بالعربية العادية — بدون /ask. الصوت والملفات مدعومان.'
                  : 'الرسائل هنا تظهر في نفس الغرفة على الموقع.',
                inGroup ? privacyHintAr(botUsername) : '',
              ]
                .filter(Boolean)
                .join('\n')
            )
            return
          }
        }
      } else {
        await upsertChannelBinding({
          channel: 'telegram',
          externalId: chatId,
          scopeId: boundScopeId,
          userId,
        })
      }
      await ctx.reply(
        [
          bindCmd.cmd === 'link'
            ? 'تم ربط هذه المحادثة بغرفة Arabic Buzz.'
            : 'مرحباً — بوت Arabic Buzz جاهز.',
          `معرّف هذه المحادثة: ${chatId}`,
          `المساحة: ${boundName} (${boundScopeId})`,
          payload ? 'تم الربط عبر وسيط الدعوة.' : '',
          inGroup
            ? [
                'الآن المجموعة مثل الموقع: اكتب طلبك بالعربي العادي — بدون /ask.',
                'الصوت والملفات (Word/Excel/PDF/صور) تدخل وتُعدَّل وتُرجَع هنا.',
                'عدة لجان: /link finance أو /link scope_…__c_programs في مجموعة أخرى.',
                privacyHintAr(botUsername),
              ].join('\n')
            : 'أضِف TELEGRAM_OWNER_CHAT_ID على CranL إن أردت تثبيت مالك التنبيهات.',
          'أوامر اختيارية: /help · /status · /rooms · /approve',
        ]
          .filter(Boolean)
          .join('\n')
      )
      return
    }

    if (helpCmd) {
      const tag = botUsername ? `@${botUsername}` : ''
      await ctx.reply(
        [
          '🤖 بوت Arabic Buzz — القروب المربوط = غرفة الفريق على الموقع',
          'الموقع: https://arabicbuzz-fooc9h.cranl.net/',
          '',
          '📌 بعد /link اكتب عادي (بدون /ask):',
          '• موعد / اجتماع → يُضاف لتقويم الغرفة (توقيت السعودية)',
          '• مهمة / طلب → لوحة مهام الغرفة',
          '• ملف / لائحة / حوّل / عدّل → خزنة الغرفة + Drive إن مربوط',
          '• سؤال / لخّص / ابحث → وكيل١ (+ وكيل٢ عند الانشغال)',
          '• أرسل لأحمد: … → خاص إن بدأ البوت، وإلا منشور في المجموعة',
          '• بلّغ المجموعة: … → تنبيه للجميع في القروب',
          '• نسّق مع سارة: … → تبليغ/تنسيق',
          '',
          '🎤 صوت: تفريغ عربي → ملخص القصد → أزرار سريعة + تنفيذ تلقائي',
          '📎 ملفات: Word / Excel / PDF / صور (+ OCR للممسوح)',
          '✉️ بريد: إن رُبط Google/صندوق البريد من الموقع',
          '',
          'حدود صادقة:',
          '• Drive يحتاج ربط Google من الموقع',
          '• لا رسالة خاصة لمن لم يضغط Start على البوت',
          '• الحذف فقط بموافقة بشرية (أزرار)',
          '',
          'أوامر:',
          `/link${tag} — ربط المجموعة بالغرفة`,
          '/help · /status · /rooms · /approve',
          '',
          'إعداد المجموعة:',
          '1) أضف البوت كمشرف (رسائل + وسائط)',
          `2) /link${tag}`,
          '3) BotFather → Group Privacy → Disable',
          '4) اكتب طلبك',
          '',
          privacyHintAr(botUsername),
        ].join('\n')
      )
      return
    }

    if (statusCmd) {
      const pending = await listPendingApprovals().catch(() => [])
      await ctx.reply(
        [
          'حالة Arabic Buzz عبر تيليجرام:',
          `المحادثة: ${chatId}${inGroup ? ' (مجموعة مربوطة)' : ' (خاص)'}`,
          `المساحة: ${scope.scope.nameAr} (${scope.scope.id})`,
          `موافقات معلّقة: ${pending.length}`,
          'الوكيل: نص · صوت · ملفات — مثل الموقع',
          'الموقع: https://arabicbuzz-fooc9h.cranl.net/',
          inGroup ? privacyHintAr(botUsername) : '',
        ]
          .filter(Boolean)
          .join('\n')
      )
      return
    }

    if (roomsCmd) {
      await ctx.reply(
        [
          `المساحة النشطة: ${scope.scope.nameAr}`,
          `المعرّف: ${scope.scope.id}`,
          inGroup
            ? 'اكتب بالعربية العادية في المجموعة — بدون /ask.'
            : 'غيّر الربط من الموقع أو برابط الدعوة.',
        ].join('\n')
      )
      return
    }

    if (approveCmd) {
      try {
        const { isDeleteClassTool } = await import('@/lib/security/posture')
        const pending = (await listPendingApprovals()).filter((a) =>
          isDeleteClassTool(a.actionName)
        )
        if (!pending.length) {
          await ctx.reply(
            'لا موافقات حذف معلّقة. باقي الإجراءات تتم تلقائياً بدون موافقة.'
          )
          return
        }
        await ctx.reply(`موافقات حذف معلّقة: ${pending.length}`)
        for (const a of pending.slice(0, 5)) {
          await ctx.reply(
            `حذف يحتاج موافقة\nالإجراء: ${a.actionName}\nالمستوى: ${a.riskLevel}\n#${a.approvalId.slice(0, 8)}`,
            { reply_markup: buildApprovalKeyboard(a.approvalId) }
          )
        }
      } catch (e) {
        await ctx.reply(
          e instanceof Error ? e.message : 'تعذّر جلب الموافقات.'
        )
      }
      return
    }

    // Agent turn: plain Arabic (linked group / DM), optional /ask, mention, reply
    let promptSource = rawText
    if (askCmd) {
      if (!askCmd.args) {
        await ctx.reply(
          'اكتب طلبك مباشرة بالعربية — لا حاجة لـ /ask. مثال: «لخّص آخر قرارات المجلس»'
        )
        return
      }
      promptSource = askCmd.args
    } else if (inGroup) {
      const gate = shouldHandleGroupText({
        rawText: cmd,
        botUsername,
        isReplyToBot,
        isCommand: false,
        isLinked: Boolean(existingBinding),
      })
      promptSource = gate.promptText
      if (!promptSource.trim()) {
        await ctx.reply('اكتب طلبك بالعربية بعد منشن البوت، أو عطّل Group Privacy ليرى كل الرسائل.')
        return
      }
    }

    try {
      void rememberTelegramPeer({
        scopeId: scope.scope.id,
        tgUserId: userId,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name,
        username: ctx.from?.username,
      })
      await runTelegramAgentTurn({
        ctx,
        promptSource,
        chatId,
        userId,
        scope,
      })
    } catch (e) {
      console.error('[telegram] text handler', e)
      try {
        await ctx.reply(
          formatTelegramErrorAr(e, { inGroup, botUsername })
        )
      } catch (sendErr) {
        console.error('[telegram] reply failed (permissions?)', sendErr)
      }
    }
  })

  bot.on(['message:voice', 'message:audio'], async (ctx) => {
    if (ctx.from?.is_bot) return
    const chatId = String(ctx.chat.id)
    const userId = String(ctx.from?.id || 'user-1')
    const inGroup = isGroupChat(ctx.chat)
    const botUsername = ctx.me.username || ''

    try {
      if (inGroup) {
        const binding = await lookupChannelBinding({
          channel: 'telegram',
          externalId: chatId,
        })
        if (!binding) {
          await ctx.reply(
            formatTelegramErrorAr('اربط المجموعة', {
              inGroup: true,
              botUsername,
            })
          )
          return
        }
      }

      const file = await ctx.getFile()
      if (!file.file_path) throw new Error('مسار الملف الصوتي غير متوفر')
      const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`
      const res = await fetch(url)
      const buffer = Buffer.from(await res.arrayBuffer())
      const mime =
        ctx.message.voice || ctx.message.audio?.mime_type?.includes('ogg')
          ? 'audio/ogg'
          : ctx.message.audio?.mime_type || 'audio/ogg'

      const scope = await resolveTelegramScope({
        chatId,
        userId,
        autoBind: !inGroup,
      })
      if (!scope) {
        await ctx.reply(
          formatTelegramErrorAr('تعذّر ربط المحادثة — جرّب /link', {
            inGroup,
            botUsername,
          })
        )
        return
      }
      void upsertChannelBinding({
        channel: 'telegram',
        externalId: chatId,
        scopeId: scope.scope.id,
        userId,
      })

      void rememberTelegramPeer({
        scopeId: scope.scope.id,
        tgUserId: userId,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name,
        username: ctx.from?.username,
      })

      await ctx.reply('⏳ جاري تفريغ الصوت…')
      await ctx.replyWithChatAction('typing')
      const stt = await transcribeArabicSpeech(buffer, mime)
      const transcript = stt.text
      if (!transcript?.trim()) {
        await ctx.reply(
          formatTelegramErrorAr('تعذّر تفريغ الصوت', { inGroup, botUsername })
        )
        return
      }

      const voiceWork = classifyTelegramWorkIntent(transcript)

      // If STT returned mostly Latin (rare), ask the agent to translate → MSA then act.
      const arabicChars = (transcript.match(/[\u0600-\u06FF]/g) || []).length
      const latinChars = (transcript.match(/[A-Za-z]/g) || []).length
      const needsTranslate =
        latinChars > 12 && latinChars > arabicChars * 2

      const voiceName = `telegram-voice-${Date.now()}.ogg`
      let voiceMarker = ''
      try {
        const saved = await saveWorkspaceFile({
          scopeId: scope.scope.id,
          buffer,
          originalName: voiceName,
          mimeType: mime,
        })
        voiceMarker = formatDownloadMarker({
          name: saved.file.originalName,
          fileId: saved.file.id,
          kind: 'voice',
        })
      } catch (saveErr) {
        console.error('[telegram] voice save', saveErr)
      }

      await ctx.reply(
        formatVoiceSttSummaryAr({
          transcript,
          intentLabelAr: voiceWork.labelAr,
          providerLabelAr: stt.providerLabelAr,
        })
      )

      rememberVoiceTranscript({
        chatId,
        transcript,
        scopeId: scope.scope.id,
        userId,
      })

      // Quick action buttons — user can override/clarify after STT
      await ctx.reply(VOICE_QUICK_HINT_AR, {
        reply_markup: buildVoiceQuickKeyboard(),
      })

      const promptSource = [
        transcript,
        needsTranslate
          ? '\n[الصوت يبدو بغير العربية — ترجم القصد إلى فصحى ثم نفّذ]'
          : '',
        voiceWork.kind === 'appointment'
          ? '\n[صوت: موعد — أنشئ في تقويم الغرفة بعد استخراج التاريخ/الوقت]'
          : voiceWork.kind === 'task'
            ? '\n[صوت: مهمة — سجّل في لوحة مهام الغرفة]'
            : voiceWork.kind === 'file'
              ? '\n[صوت: ملف — ابحث/عدّل/حوّل وأعد المرفق]'
              : voiceWork.kind === 'message'
                ? '\n[صوت: رسالة/تبليغ — notify_room_member فوراً]'
                : '\n[صوت: نفّذ كغرفة الموقع — وكيل١ + أدوات كاملة إن لزم]',
        voiceMarker
          ? `\n${voiceMarker}\n(صوت محفوظ في مساحة العمل — يمكن سحبه للمساعدين أو غرفة الفريق من المرآة.)`
          : '',
      ]
        .filter(Boolean)
        .join('\n')

      // Clear intents auto-act; buttons remain for override/clarify.
      await runTelegramAgentTurn({
        ctx,
        promptSource,
        chatId,
        userId,
        scope,
        forceHeavy: voiceWork.forceHeavy || voiceWork.kind === 'question',
        workLabelAr: voiceWork.labelAr,
      })
      // TTS is handled inside runTelegramAgentTurn (short summaries / TELEGRAM_VOICE_REPLY).
    } catch (e) {
      console.error('[telegram] voice', e)
      try {
        await ctx.reply(
          formatTelegramErrorAr(e, { inGroup, botUsername })
        )
      } catch {
        /* no send permission in group */
      }
    }
  })

  bot.on(['message:document', 'message:photo'], async (ctx) => {
    if (ctx.from?.is_bot) return
    const chatId = String(ctx.chat.id)
    const userId = String(ctx.from?.id || 'user-1')
    const inGroup = isGroupChat(ctx.chat)
    const botUsername = ctx.me.username || ''
    const caption = (ctx.message.caption || '').trim()
    const isReplyToBot = Boolean(
      ctx.message.reply_to_message?.from?.id &&
        ctx.message.reply_to_message.from.id === ctx.me.id
    )

    try {
      if (inGroup) {
        const binding = await lookupChannelBinding({
          channel: 'telegram',
          externalId: chatId,
        })
        if (!binding) {
          const { mentioned } = stripBotMention(caption, botUsername)
          if (!mentioned && !isReplyToBot) return
          await ctx.reply(
            formatTelegramErrorAr('اربط المجموعة', {
              inGroup: true,
              botUsername,
            })
          )
          return
        }
      }

      const scope = await resolveTelegramScope({
        chatId,
        userId,
        autoBind: !inGroup,
      })
      if (!scope) {
        await ctx.reply(
          formatTelegramErrorAr('تعذّر ربط المحادثة — جرّب /link', {
            inGroup,
            botUsername,
          })
        )
        return
      }
      void upsertChannelBinding({
        channel: 'telegram',
        externalId: chatId,
        scopeId: scope.scope.id,
        userId,
      })

      await ctx.replyWithChatAction('typing')
      let ingested: { fileId: string; name: string; mimeType: string }

      if (ctx.message.document) {
        const doc = ctx.message.document
        ingested = await ingestTelegramDocumentToWorkspace({
          ctx,
          scopeId: scope.scope.id,
          fileId: doc.file_id,
          fileName: doc.file_name || `telegram-doc-${Date.now()}`,
          mimeType: doc.mime_type,
        })
      } else {
        const photos = ctx.message.photo || []
        const best = photos[photos.length - 1]
        if (!best) {
          await ctx.reply('لم أجد صورة صالحة.')
          return
        }
        ingested = await ingestTelegramPhotoToWorkspace({
          ctx,
          scopeId: scope.scope.id,
          fileId: best.file_id,
        })
      }

      const { mentioned, text: captionStripped } = stripBotMention(
        caption,
        botUsername
      )
      const isImage =
        ingested.mimeType.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif|tif{1,2}|bmp)$/i.test(ingested.name)
      const isPdf =
        ingested.mimeType.includes('pdf') ||
        ingested.name.toLowerCase().endsWith('.pdf')
      const captionLower = captionStripped.toLowerCase()
      const wantsOcr =
        isImage ||
        /اقرأ|اقرا|استخرج|ممسوح|مسح|ocr|ابحث عن|هل يوجد|هل فيه/.test(
          captionLower
        ) ||
        (isPdf && /ممسوح|مسح|صورة|scan/.test(captionLower))

      const userAsk =
        captionStripped ||
        (mentioned
          ? wantsOcr
            ? 'اقرأ النص المكتوب في هذا المرفق (OCR) ولخّص المحتوى.'
            : 'اقرأ هذا الملف ونفّذ المطلوب إن وُجد، وإلا لخّص المحتوى واقترح الخطوة التالية.'
          : wantsOcr
            ? 'اقرأ النص الظاهر في الصورة/المستند الممسوح واستخرجه.'
            : 'اقرأ هذا الملف المرفق. إن طلب المستخدم تعديلاً في التعليق نفّذه وأعد الملف المعدّل، وإلا لخّص المحتوى باختصار.')

      const ocrHint = wantsOcr
        ? [
            isImage || isPdf
              ? 'هذا مرفق صورة أو PDF — استخدم arabic_ocr مع fileId أعلاه (saveToMemory=true).'
              : 'إن بدا المستند ممسوحاً استخدم arabic_ocr مع fileId.',
            'إن طلب المستخدم البحث عن عبارة، مرّر searchQuery بنفس العبارة.',
            'بعد الاستخراج أعد النص أو مواضع البحث للمستخدم. النص يُحفظ تلقائياً في ذاكرة الغرفة وملف .txt.',
          ].join(' ')
        : 'استخدم read_document أو read_excel أو أدوات الصور حسب النوع، ثم عدّل عند الحاجة بـ edit_document/edit_excel وأعد الملف عبر return_file. للصور/PDF الممسوح فضّل arabic_ocr.'

      const promptSource = [
        userAsk,
        '',
        `ملف مرفوع من تيليجرام: «${ingested.name}» (fileId=${ingested.fileId}, mime=${ingested.mimeType}).`,
        formatDownloadMarker({
          name: ingested.name,
          fileId: ingested.fileId,
          kind: ingested.mimeType.startsWith('audio/') ? 'voice' : 'file',
        }),
        ocrHint,
      ].join('\n')

      await runTelegramAgentTurn({
        ctx,
        promptSource,
        chatId,
        userId,
        scope,
        forceHeavy: true,
      })
    } catch (e) {
      console.error('[telegram] document/photo', e)
      try {
        await ctx.reply(
          formatTelegramErrorAr(e, { inGroup, botUsername })
        )
      } catch {
        /* ignore */
      }
    }
  })

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data || ''

    // Voice quick buttons: أضِف موعد / مهمة / ابحث عن الملف
    const voiceAction = parseVoiceQuickCallback(data)
    if (voiceAction) {
      const chatId = String(ctx.chat?.id || ctx.callbackQuery.message?.chat.id || '')
      const userId = String(ctx.from?.id || 'user-1')
      const cached = takeVoiceTranscript(chatId)
      if (!cached?.transcript) {
        await ctx.answerCallbackQuery({
          text: 'انتهت صلاحية النص الصوتي — أعد إرسال الصوت',
          show_alert: true,
        })
        return
      }
      try {
        await ctx.answerCallbackQuery({
          text:
            voiceAction === 'appointment'
              ? 'جاري إضافة موعد…'
              : voiceAction === 'task'
                ? 'جاري تسجيل مهمة…'
                : voiceAction === 'message'
                  ? 'جاري إرسال الرسالة…'
                  : voiceAction === 'broadcast'
                    ? 'جاري تبليغ المجموعة…'
                    : voiceAction === 'run'
                      ? 'جاري التنفيذ الكامل…'
                      : 'جاري البحث عن الملف…',
        })
      } catch {
        /* already answered */
      }
      try {
        const scope = await resolveTelegramScope({
          chatId,
          userId,
          preferredScopeId: cached.scopeId,
          autoBind: true,
        })
        if (!scope) {
          await ctx.reply('تعذّر ربط المحادثة بالغرفة.')
          return
        }
        const q = voiceQuickPrompt(voiceAction, cached.transcript)
        // Keep transcript for other buttons
        rememberVoiceTranscript({
          chatId,
          transcript: cached.transcript,
          scopeId: scope.scope.id,
          userId,
        })
        try {
          await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
        } catch {
          /* ignore */
        }
        await runTelegramAgentTurn({
          ctx,
          promptSource: q.prompt,
          chatId,
          userId,
          scope,
          forceHeavy: q.forceHeavy,
          workLabelAr: q.labelAr,
        })
      } catch (e) {
        console.error('[telegram] voice-quick', e)
        await ctx.reply(formatTelegramErrorAr(e))
      }
      return
    }

    let decision: 'APPROVE' | 'REJECT' | null = null
    let actionId = ''

    if (data.startsWith('approve_')) {
      decision = 'APPROVE'
      actionId = data.slice('approve_'.length)
    } else if (data.startsWith('reject_')) {
      decision = 'REJECT'
      actionId = data.slice('reject_'.length)
    } else {
      const [kind, id] = data.split(':')
      if (id && (kind === 'apprv' || kind === 'rjct')) {
        decision = kind === 'apprv' ? 'APPROVE' : 'REJECT'
        actionId = id
      }
    }

    if (!decision || !actionId) {
      await ctx.answerCallbackQuery({
        text: 'بيانات غير صالحة',
        show_alert: true,
      })
      return
    }

    try {
      await ctx.answerCallbackQuery({
        text:
          decision === 'APPROVE'
            ? 'جاري الموافقة والتنفيذ…'
            : 'جاري تسجيل الرفض…',
      })
    } catch {
      /* already answered */
    }

    const telegramUserId = String(ctx.from?.id || 'telegram')
    const rbacUserId =
      process.env.TELEGRAM_APPROVER_USER_ID || 'user-1'
    const orgId =
      process.env.TELEGRAM_DEFAULT_ORG_ID ||
      process.env.DEFAULT_ORG_ID ||
      'org-demo'
    const { DEFAULT_DIRECTOR_EMAIL } = await import('@/lib/auth/roles')
    const approverEmail =
      process.env.TELEGRAM_APPROVER_EMAIL?.trim() ||
      process.env.DIRECTOR_EMAIL?.trim() ||
      DEFAULT_DIRECTOR_EMAIL

    try {
      const result = await resolveApproval({
        approvalId: actionId,
        decision,
        approvedBy: telegramUserId,
        userId: rbacUserId,
        orgId,
        email: approverEmail,
      })

      const detailAr =
        result.status === 'APPROVED'
          ? `✅ تمت الموافقة على الإجراء (${actionId.slice(0, 8)}…) وتنفيذه بنجاح.`
          : `❌ تم رفض الإجراء (${actionId.slice(0, 8)}…). لن يتم التنفيذ.`

      await updateApprovalInSupabase({
        approvalId: actionId,
        status: result.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        resolvedBy: telegramUserId,
        decisionNoteAr: detailAr,
      })

      try {
        await ctx.editMessageText(detailAr, {
          reply_markup: { inline_keyboard: [] },
        })
      } catch {
        await ctx.reply(detailAr)
      }
    } catch (e) {
      console.error('[telegram] callback', e)
      let msg = 'تعذّر تسجيل قرار الموافقة. حاول مرة أخرى.'
      if (e instanceof AuthorizationError) {
        msg = e.message || ARABIC_AUTHZ_ERROR
      } else if (e instanceof Error) {
        if (e.message === 'NOT_FOUND') {
          msg =
            'لم يُعثر على طلب الموافقة (انتهت صلاحيته أو عولج مسبقاً أو فشل حفظه في قاعدة البيانات).'
        } else if (e.message === 'ALREADY_RESOLVED') {
          msg = 'تم البت في هذا الطلب مسبقاً.'
        } else if (e.message === 'MISSING_TENANT_CONTEXT') {
          msg = ARABIC_AUTHZ_ERROR
        } else if (e.message.startsWith('Unknown tool')) {
          msg = `فشل التنفيذ: الأداة غير معروفة (${e.message}).`
        } else {
          msg = `تعذّر التنفيذ: ${e.message.slice(0, 140)}`
        }
      }
      try {
        await ctx.reply(msg)
      } catch {
        /* ignore */
      }
    }
  })

  return bot
}

/** Process a Telegram update payload directly (webhook + async workflow dispatch). */
export async function processTelegramUpdatePayload(payload: unknown) {
  const raw = payload as { update_id?: number }
  const claimed = await claimTelegramUpdate(raw?.update_id)
  if (!claimed) {
    console.info('[telegram] skip duplicate update_id', raw?.update_id)
    return
  }
  const instance = await ensureTelegramBotReady()
  await ensureBotCommands(instance)
  const update = payload as Parameters<typeof instance.handleUpdate>[0]
  await instance.handleUpdate(update)
}
