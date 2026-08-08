import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy'
import { streamText, generateText, stepCountIs, type ToolSet } from 'ai'
import {
  lookupChannelBinding,
  resolveChannelScope,
  upsertChannelBinding,
} from '@/lib/channels/bindings'
import { resolveTelegramRequesterUserId } from '@/lib/telegram/user-link'
import {
  linkTelegramUserToWorkspace,
  lookupTelegramWorkspaceUserId,
} from '@/lib/telegram/user-link'
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
  extractAttachmentsFromAgentSteps,
  ingestTelegramDocumentToWorkspace,
  ingestTelegramPhotoToWorkspace,
  ingestTelegramVideoToWorkspace,
  isTrivialGroupMessage,
  sendAttachmentsToTelegramChat,
  type TelegramAttachmentRef,
} from '@/lib/telegram/media'
import {
  shouldDeliverSilentAttachment,
  isTelegramDownloadLimitError,
} from '@/lib/telegram/attachment-deliver'
import { afterTelegramMediaSaved } from '@/lib/telegram/media-import'
import {
  assertCaptionWorkMustExecute,
  decideTelegramMediaExecute,
} from '@/lib/telegram/media-execute-policy'
import {
  formatRecentTelegramMediaHint,
  rememberTelegramMedia,
  getLatestTelegramMedia,
} from '@/lib/telegram/recent-media'
import {
  persistTelegramAttachment,
  hydrateRecentMediaFromPersist,
  telegramLargeFileWorkingPathAr,
} from '@/lib/telegram/attachment-persist'
import {
  enqueueTelegramFileJob,
  inferPdfDuplicateWorkParams,
  updateTelegramFileJob,
} from '@/lib/telegram/file-jobs'
import {
  prepareTelegramFileJobResumes,
} from '@/lib/telegram/resume-file-jobs'
import { afterVaultFileMaybeRunTelegramJobs } from '@/lib/telegram/execute-file-jobs'
import {
  formatUnknownShortAr,
  isCasualTelegramWork,
  looksLikeBlockedTaskReply,
  looksLikeUnknownOrNotFound,
  resolveGroupReplyMode,
  type TelegramGroupReplyMode,
} from '@/lib/telegram/group-reply-policy'
import {
  resolveCapabilityGapReplyAr,
  resolveCapabilityGapResearch,
} from '@/lib/agents/tools/research-task-tools'
import { TELEGRAM_CAPABILITY_CASCADE_SYSTEM_AR } from '@/lib/telegram/capability-cascade'
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
import { loadTelegramAgentPool } from '@/lib/telegram/agent-pool'
import type { RoomAgent } from '@/lib/rooms/agents'
import { effortToRunParams } from '@/lib/ai/run-effort'
import { parseTelegramMessageIntent } from '@/lib/telegram/message-intent'
import {
  deliverGroupBroadcast,
  deliverNamedTelegramMessage,
  rememberTelegramPeer,
} from '@/lib/telegram/peer-directory'
import { formatTelegramErrorAr } from '@/lib/telegram/errors-ar'
import {
  buildTelegramHelpAr,
  buildTelegramHelpMenuKeyboard,
  buildTelegramHelpDomainAr,
  buildTelegramStatusLinesAr,
  buildTelegramGoogleConnectHintAr,
  parseHelpMenuCallback,
  TELEGRAM_PING_OK_AR,
  TELEGRAM_GOOGLE_CONNECT_URL,
} from '@/lib/telegram/help-copy'
import {
  installTelegramNeverDeleteGuard,
  TelegramNeverDeleteError,
} from '@/lib/telegram/never-delete'

function pickToolSubset(all: ToolSet, names: readonly string[]): ToolSet {
  const out: ToolSet = {}
  for (const name of names) {
    if (all[name]) out[name] = all[name]
  }
  return out
}

/** Never silent on unknown capability — research free/low-cost tools then reply MSA. */
async function replyForCapabilityGapAr(opts: {
  task: string
  agentText?: string
}): Promise<string> {
  const t = String(opts.agentText || '').trim()
  if (looksLikeBlockedTaskReply(t)) return formatUnknownShortAr(t)
  try {
    return await resolveCapabilityGapReplyAr({
      task: opts.task,
      agentText: t,
    })
  } catch (e) {
    console.warn('[telegram] capability-gap research', e)
    return formatUnknownShortAr(t || opts.task)
  }
}

/**
 * After «ما عرفت»: research → if free builtins map, re-run agent once to EXECUTE
 * and deliver via return_file. Paid gate only when free exhausted.
 */
async function researchThenMaybeFreeExecute(opts: {
  task: string
  agentText?: string
  ctx: Context
  prompt: string
  system: string
  modelSlug: string
  scopeId: string
  maxSteps: number
  tools: ToolSet
  runLocked: <T>(fn: () => Promise<T>) => Promise<T>
  workKind: string
}): Promise<{
  handled: boolean
  text: string
  citations: RoomCitation[]
  pendingApprovalIds: string[]
  attachmentsSent: string[]
}> {
  let research: Awaited<ReturnType<typeof resolveCapabilityGapResearch>>
  try {
    research = await resolveCapabilityGapResearch({
      task: opts.task,
      agentText: opts.agentText,
    })
  } catch (e) {
    console.warn('[telegram] free-execute research', e)
    const gap = await replyForCapabilityGapAr({
      task: opts.task,
      agentText: opts.agentText,
    })
    await opts.ctx.reply(gap)
    return {
      handled: true,
      text: gap,
      citations: [],
      pendingApprovalIds: [],
      attachmentsSent: [],
    }
  }

  if (research.canExecuteFree && research.executeNext.length) {
    const forced = [
      opts.prompt,
      '',
      research.messageAr,
      '[إعادة محاولة إلزامية — مسار مجاني مدمج. نفّذ الأدوات أعلاه الآن ثم return_file. ممنوع السؤال.]',
    ].join('\n')
    try {
      const retry = await opts.runLocked(() =>
        runSilentTelegramTools({
          prompt: forced,
          system: opts.system,
          modelSlug: opts.modelSlug,
          scopeId: opts.scopeId,
          maxSteps: Math.max(opts.maxSteps, 8),
          tools: opts.tools,
        })
      )
      const attachmentsSent = await deliverSilentTelegramResults({
        ctx: opts.ctx,
        attachments: retry.attachments,
        pendingApprovalIds: retry.pendingApprovalIds,
        workKind: opts.workKind,
        prompt: opts.task,
      })
      const stillUnknown =
        attachmentsSent.length === 0 &&
        looksLikeUnknownOrNotFound(retry.text)
      if (!stillUnknown) {
        const text =
          retry.text?.trim() ||
          (attachmentsSent.length
            ? `تم التنفيذ مجاناً عبر ${research.executeNext.map((h) => h.toolName).join(' · ')}.`
            : research.messageAr)
        if (text && attachmentsSent.length === 0) {
          await opts.ctx.reply(text.slice(0, 3900))
        } else if (attachmentsSent.length && text && !looksLikeUnknownOrNotFound(text)) {
          await opts.ctx.reply(text.slice(0, 3900)).catch(() => undefined)
        }
        return {
          handled: true,
          text,
          citations: retry.citations,
          pendingApprovalIds: retry.pendingApprovalIds,
          attachmentsSent,
        }
      }
    } catch (e) {
      console.warn('[telegram] free-execute retry', e)
    }
  }

  // Paid gate / blocked — only interrupt user for money after free exhausted.
  const gap = research.messageAr || (await replyForCapabilityGapAr({
    task: opts.task,
    agentText: opts.agentText,
  }))
  await opts.ctx.reply(gap)
  return {
    handled: true,
    text: gap,
    citations: [],
    pendingApprovalIds: [],
    attachmentsSent: [],
  }
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

const TELEGRAM_AGENT_SYSTEM = `أنت وكيل Arabic Buzz عبر تيليجرام — أقصى قوة أدواتية: نفس غرفة الموقع (ليس نسخة بصرية كاملة).
- افهم الفصحى والعامية السعودية/الخليجية؛ أعد صياغة القصد داخلياً وأجب بالفصحى المهنية الموجزة.
- لا تنتظر /ask ولا تنتظر تأكيد الأزرار — نفّذ فوراً بعد فهم الطلب (نص · صوت · ملف · صورة).
- أيقظ وكيل١ ثم وكيل٢…عند الانشغال. طلب ثقيل / «أبغا للجميع» / وضع فريق الغرفة → تشغيل متوازٍ للمقاعد المتفرّغة (حتى ٨). «يا وكيل١» / @وكيل٢ يوجّهان مقعداً بعينه.
- ذاكرة الشات: عندك سجل محادثة المجموعة الكامل (مرآة الغرفة) + المهام المعلّقة — نفّذ على أساسه ولا تتجاهل طلباً سابقاً في نفس القروب.
- نفّذ بكل الأدوات: ملفات تيليجرام/خزنة الغرفة، تحويل، OCR، تعليق PDF (pdf_annotate)، تقويم الغرفة، مهام، بريد الجمعية + Gmail، Sheets، بحث موحّد (room_search)، إحاطة الصباح (owner_morning_brief)، تبليغ أعضاء، سير عمل. Drive اختياري.
- بحث عام في «الموقع/الغرفة»: room_search أولاً ثم فصّل. إحاطة/ملخص اليوم: owner_morning_brief.
- التقويم الجماعي: room_calendar_* فقط (Asia/Riyadh). إن رجعت الأداة فارغة فقل «لا مواعيد» — ممنوع الاختلاق. لا تستخدم تقويم Google الشخصي كأجندة الفريق.
- موعد جديد: room_calendar_create فوراً ثم أكّد العنوان · الوقت · أنه في تقويم الغرفة.
- مهام: room_tasks_create / update فوراً.
- ملفات تيليجرام أولاً: إن وُجد fileId لمرفق في الرسالة/السياق → هذه نسخة العمل الوحيدة. اقرأ/عدّل/حوّل/OCR/pdf_duplicate_page ثم return_file (مرفق تيليجرام). ممنوع brain_open/drive_search أو أي تطابق تقريبي بالاسم كبديل. ممنوع طلب إعادة الإرسال إن وُجدت بايتات/خزنة/مهمة معلّقة — استأنف. إن انعدمت كل المسارات: رسالة عربية واحدة تطلب الرفع للموقع/Drive بنفس الاسم.
- ملف كبير: أكمل عبر غرفة الفريق أو Drive ثم أرسل الناتج هنا (sendDocument/ضغط). رابط Drive وحده ليس إكمالاً إن طلب المستخدم ملف تيليجرام.
- بدون مرفق صريح: list_workspace_files بالاسم/المعرّف المطابق حرفياً فقط. Drive/brain_open_document فقط عند طلب صريح لاسم أو معرّف Drive كامل.
- تعديل ثم إرجاع: edit_document / edit_excel / pdf_replace_text / pdf_annotate / convert_document ثم return_file. حفظ Drive بـ brain_save_document اختياري بعد النجاح إن طُلب.
- حذف ملف غرفة/Drive: عبر الأداة مع موافقة HITL — ممنوع حذف رسائل تيليجرام.
- صور/PDF ممسوح: arabic_ocr. لا drive_sync_brain إلا بطلب مزامنة صريح («زامن الدرايف»).
- بريد: mail_* لصندوق الجمعية (أعضاء الجلسة مسموح)؛ gmail_* للشخصي المربوط — نفّذ ولخّص، لا تختلق رسائل.
- بحث ويب: web_search / web_fetch عند طلب بحث أو معلومة خارجية.
- تشغيل تلقائي مطلق: ممنوع «هل تريد؟» للعمل الروتيني. ممنوع طلب إعادة إرسال إن وُجدت بايتات/خزنة/مهمة معلّقة/Drive بالاسم — استأنف ونفّذ.
- إن عجزت الأدوات (أو «ما عرفت»): استدعِ research_task_tools → إن canExecuteFree/executeNext نفّذ الأدوات المجانية المدمجة فوراً (pdf-lib…) وreturn_file للمجموعة. لا تشغّل كود MCP بعيداً غير موثوق.
- فقط إن blocked بعد استنفاد المجاني: انشر messageAr (بدائل مدفوعة الأرخص) وانتظر المفتاح/الموافقة — هذه المقاطعة الوحيدة للمستخدم بسبب المال.
- «أرسل لفلان» / تبليغ شخص: notify_room_member فوراً. خاص فقط إن بدأ المستلم Start؛ وإلا المجموعة — اشرح بصراحة. تنسيق/تعديل ملف ≠ تبليغ شخص.
- HITL فقط لحذف ملفات الغرفة/Drive الحساس (RBAC) أو بوابة الدفع — ممنوع HITL لتعديل/تحويل روتيني. ممنوع حذف رسائل تيليجرام.
${TELEGRAM_LIMITS_SYSTEM_AR}
${TELEGRAM_CAPABILITY_CASCADE_SYSTEM_AR}`

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
      { command: 'link', description: 'ربط المجموعة أو حساب الموقع' },
      { command: 'start', description: 'قائمة التشغيل أو الربط' },
      { command: 'help', description: 'قائمة الأدوات التفاعلية' },
      { command: 'status', description: 'حالة الربط وGoogle (قراءة)' },
      { command: 'rooms', description: 'المساحة المربوطة' },
      { command: 'approve', description: 'الموافقات المعلّقة' },
      { command: 'ping', description: 'فحص سريع أن البوت يستجيب' },
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
 * Linked group (after /link): every delivered update is ingested + analyzed.
 * Visible replies follow INTENT (not @mention): actionable request → act + reply;
 * people chatting → silent. Mention/reply/command still force full reply.
 * Unlinked group: only @mention / reply-to-bot (to nudge /link).
 * Disable Group Privacy so the bot receives every message live.
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
    // Skip pure emoji/reactions only — everything else is analyzed live in Telegram.
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
    'مهم — ليرى البوت كل الرسائل:',
    'BotFather → اختر البوت → Bot Settings → Group Privacy → Disable',
    'يكتب طلبك عادي («أبغى كذا») أو صوت — بدون منشن. ينفّذ ويرد بالناتج.',
    'الدردشة بين الناس تُترَك بصمت (استيراد الوسائط فقط). المنشن اختياري.',
    `إن احتجت ردّاً نصياً صريحاً: منشن ${tag} أو رد على رسالة البوت.`,
  ].join('\n')
}

function ctxAddressesBot(
  ctx: Context,
  botUsername: string
): { mentioned: boolean; isReplyToBot: boolean } {
  const msg = ctx.message
  const isReplyToBot = Boolean(
    msg?.reply_to_message?.from?.id &&
      msg.reply_to_message.from.id === ctx.me.id
  )
  const text = String(msg?.text || msg?.caption || '')
  const { mentioned: atMention } = stripBotMention(text, botUsername)
  const uname = botUsername.replace(/^@/, '').trim().toLowerCase()
  const entities = [
    ...(msg?.entities || []),
    ...(msg?.caption_entities || []),
  ] as Array<{
    type: string
    offset: number
    length: number
    user?: { id: number }
  }>
  let entityMention = false
  for (const e of entities) {
    if (e.type === 'text_mention' && e.user?.id === ctx.me.id) {
      entityMention = true
      break
    }
    if (e.type === 'mention' && uname) {
      const slice = text.slice(e.offset, e.offset + e.length).toLowerCase()
      if (slice.includes(`@${uname}`)) {
        entityMention = true
        break
      }
    }
  }
  return {
    mentioned: atMention || entityMention,
    isReplyToBot,
  }
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

/**
 * Replace the «جاري…» ack with the final text.
 * HARD BAN: never deleteMessage / deleteMessages — edit only, or leave ack
 * + new reply. HITL file deletes on the site must not cascade here.
 * Guard: installTelegramNeverDeleteGuard on the Bot instance.
 */
async function finalizeTelegramAck(opts: {
  ctx: Context
  chatId: number | string
  messageId: number
  text: string
  replyMarkup?: InlineKeyboard
}) {
  const body = opts.text.slice(0, 4000)
  try {
    await opts.ctx.api.editMessageText(
      opts.chatId,
      opts.messageId,
      body,
      opts.replyMarkup ? { reply_markup: opts.replyMarkup } : undefined
    )
    return
  } catch {
    /* message not modified / race / transient — never delete */
  }
  try {
    await opts.ctx.api.editMessageText(
      opts.chatId,
      opts.messageId,
      '✅ تم — الرد بالأسفل'
    )
  } catch {
    /* leave ack visible — never delete */
  }
  await opts.ctx.reply(
    body,
    opts.replyMarkup ? { reply_markup: opts.replyMarkup } : undefined
  )
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
  // Max power: full native toolset for work turns; light subset only for greetings.
  const subset = opts.fullRoom
    ? native
    : pickToolSubset(
        native,
        opts.heavy ? TELEGRAM_SITE_HEAVY_TOOLS : TELEGRAM_SITE_CHAT_TOOLS
      )

  // MCP: on by default for full-room turns (parity with /api/chat). Opt-out: TELEGRAM_INCLUDE_MCP=0
  const mcpFlag = process.env.TELEGRAM_INCLUDE_MCP?.trim()
  const wantMcp =
    mcpFlag === '1' || (opts.fullRoom && mcpFlag !== '0')
  if (wantMcp) {
    try {
      await connectEnvMcpServers()
      const mcpTools = await getMCPHostManager().getCombinedToolSet()
      return { ...subset, ...mcpTools }
    } catch {
      /* optional — native tools still run */
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
        toolName?: string
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
        for (const a of extractAttachmentsFromToolOutput(
          out,
          opts.scopeId,
          p.toolName ? String(p.toolName) : undefined
        )) {
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
      step as {
        toolResults?: Array<{
          toolName?: string
          result?: unknown
          output?: unknown
        }>
      }
    ).toolResults
    if (!Array.isArray(toolResults)) continue
    for (const tr of toolResults) {
      const out = tr.result ?? tr.output
      for (const a of extractAttachmentsFromToolOutput(
        out,
        opts.scopeId,
        tr.toolName ? String(tr.toolName) : undefined
      )) {
        if (!attachmentBucket.some((x) => x.fileId === a.fileId)) {
          attachmentBucket.push(a)
        }
      }
    }
  }

  const bodyBase =
    (finalText || 'تم استلام رسالتك، لكن لم يُنتَج رد نصي.') +
    formatCitationsFooterAr(citations)

  // Capability gap → research free/low-cost skills/MCPs; never pretend success.
  let body = bodyBase
  if (
    attachmentBucket.length === 0 &&
    looksLikeUnknownOrNotFound(finalText || bodyBase) &&
    !looksLikeBlockedTaskReply(finalText || '')
  ) {
    body = await replyForCapabilityGapAr({
      task: opts.prompt,
      agentText: finalText || bodyBase,
    })
  }

  const firstApproval = pendingApprovalIds[0]
  await finalizeTelegramAck({
    ctx: opts.ctx,
    chatId: opts.ctx.chat!.id,
    messageId: placeholderId,
    text: body,
    replyMarkup: firstApproval
      ? buildApprovalKeyboard(firstApproval)
      : undefined,
  })

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

/** Run tools without posting chatty text (silent execute).
 * Still collects attachments + HITL approvals for result delivery. */
async function runSilentTelegramTools(opts: {
  prompt: string
  system: string
  modelSlug: string
  scopeId: string
  maxSteps: number
  tools: ToolSet
}): Promise<{
  text: string
  citations: RoomCitation[]
  pendingApprovalIds: string[]
  attachments: TelegramAttachmentRef[]
}> {
  const citations: RoomCitation[] = []
  const pendingApprovalIds: string[] = []
  const result = await generateText({
    model: getHarnessModel(opts.modelSlug),
    system: opts.system,
    prompt: opts.prompt,
    tools: opts.tools,
    stopWhen: stepCountIs(opts.maxSteps),
  })
  const text = (result.text || '').trim()
  const steps = result.steps || []
  const stepsExtract = extractFromAgentSteps(steps)
  for (const c of stepsExtract.citations) {
    if (!citations.some((x) => x.labelAr === c.labelAr)) citations.push(c)
  }
  for (const id of stepsExtract.pendingApprovalIds) {
    if (!pendingApprovalIds.includes(id)) pendingApprovalIds.push(id)
  }
  const attachments = extractAttachmentsFromAgentSteps(steps, opts.scopeId)
  return { text, citations, pendingApprovalIds, attachments }
}

/** File/HITL results are allowed in silent group mode (not chatty spam). */
async function deliverSilentTelegramResults(opts: {
  ctx: Context
  attachments: TelegramAttachmentRef[]
  pendingApprovalIds: string[]
  workKind: string
  prompt: string
}): Promise<string[]> {
  const toSend = opts.attachments.filter((a) =>
    shouldDeliverSilentAttachment({
      toolName: a.toolName,
      workKind: opts.workKind,
      prompt: opts.prompt,
    })
  )
  const sent =
    toSend.length > 0
      ? await sendAttachmentsToTelegramChat({
          ctx: opts.ctx,
          attachments: toSend,
          captionAr: '📎 ناتج العمل',
        })
      : []
  for (const id of opts.pendingApprovalIds.slice(0, 3)) {
    await opts.ctx.reply(`موافقة مطلوبة (#${id.slice(0, 8)})`, {
      reply_markup: buildApprovalKeyboard(id),
    })
  }
  return sent
}

/** Per-seat identity block — mirrors /api/chat agentBlock. */
function telegramSeatIdentityBlock(agent: RoomAgent, team: boolean): string {
  const task = agent.taskAr ? `\nالمهمة المعيّنة: ${agent.taskAr}` : ''
  const collab = team
    ? '\n\nأنت في وضع تعاون جماعي عبر تيليجرام: نفّذ حصتك، لا تكرر عمل الزملاء بلا فائدة، وأعد نتيجة قابلة للاستخدام.'
    : ''
  return `\n\nهويتك في الغرفة: «${agent.nameAr}» (${agent.slug}).${task}\n${agent.systemPromptAr}${collab}`
}

function mergeTelegramTeamTexts(
  results: Array<{ nameAr: string; text: string }>
): string {
  const parts = results
    .map((r) => {
      const t = r.text.trim()
      if (!t) return ''
      return `【${r.nameAr}】\n${t}`
    })
    .filter(Boolean)
  if (!parts.length) return 'تم تشغيل الفريق، لكن لم يُنتَج رد نصي.'
  if (parts.length === 1) return results.find((r) => r.text.trim())?.text.trim() || parts[0]
  return `نتائج الفريق (${parts.length} مقاعد):\n\n${parts.join('\n\n')}`
}

/**
 * Parallel seats: primary streams to Telegram ack; peers run generateText.
 * Shared tools + file lock; attachments/HITL merged.
 */
async function runTelegramTeamAgentTurn(opts: {
  ctx: Context
  agents: RoomAgent[]
  prompt: string
  systemBase: string
  modelSlug: string
  requesterId: string
  scopeId: string
  maxSteps: number
  tools: ToolSet
  placeholderMessageId?: number
  silent: boolean
  runLocked: <T>(fn: () => Promise<T>) => Promise<T>
}): Promise<{
  text: string
  citations: RoomCitation[]
  pendingApprovalIds: string[]
  attachments: TelegramAttachmentRef[]
}> {
  const [primary, ...peers] = opts.agents
  const team = opts.agents.length > 1
  const peerMaxSteps = Math.max(4, Math.min(opts.maxSteps, 6))

  const peerJobs = peers.map((agent) =>
    opts.runLocked(async () => {
      const system =
        opts.systemBase + telegramSeatIdentityBlock(agent, team)
      try {
        const out = await runSilentTelegramTools({
          prompt: opts.prompt,
          system,
          modelSlug: agent.preferredModel || opts.modelSlug,
          scopeId: opts.scopeId,
          maxSteps: peerMaxSteps,
          tools: opts.tools,
        })
        return { agent, ...out }
      } catch (e) {
        console.error('[telegram] peer seat', agent.slug, e)
        return {
          agent,
          text: '',
          citations: [] as RoomCitation[],
          pendingApprovalIds: [] as string[],
          attachments: [] as TelegramAttachmentRef[],
        }
      }
    })
  )

  const primarySystem =
    opts.systemBase + telegramSeatIdentityBlock(primary, team)

  if (opts.silent) {
    const [primaryOut, ...peerOuts] = await Promise.all([
      opts.runLocked(() =>
        runSilentTelegramTools({
          prompt: opts.prompt,
          system: primarySystem,
          modelSlug: primary.preferredModel || opts.modelSlug,
          scopeId: opts.scopeId,
          maxSteps: opts.maxSteps,
          tools: opts.tools,
        })
      ),
      ...peerJobs,
    ])
    const citations = [...primaryOut.citations]
    const pendingApprovalIds = [...primaryOut.pendingApprovalIds]
    const attachments = [...primaryOut.attachments]
    for (const p of peerOuts) {
      for (const c of p.citations) {
        if (!citations.some((x) => x.labelAr === c.labelAr)) citations.push(c)
      }
      for (const id of p.pendingApprovalIds) {
        if (!pendingApprovalIds.includes(id)) pendingApprovalIds.push(id)
      }
      for (const a of p.attachments) {
        if (!attachments.some((x) => x.fileId === a.fileId)) attachments.push(a)
      }
    }
    const text = mergeTelegramTeamTexts([
      { nameAr: primary.nameAr, text: primaryOut.text },
      ...peerOuts.map((p) => ({ nameAr: p.agent.nameAr, text: p.text })),
    ])
    return { text, citations, pendingApprovalIds, attachments }
  }

  // Visible: stream primary while peers work in parallel.
  const peerPromise = Promise.all(peerJobs)
  const primaryOut = await opts.runLocked(() =>
    streamTelegramReply({
      ctx: opts.ctx,
      prompt: opts.prompt,
      system: primarySystem,
      modelSlug: primary.preferredModel || opts.modelSlug,
      requesterId: opts.requesterId,
      scopeId: opts.scopeId,
      maxSteps: opts.maxSteps,
      tools: opts.tools,
      placeholderMessageId: opts.placeholderMessageId,
    })
  )
  const peerOuts = await peerPromise

  const citations = [...primaryOut.citations]
  const pendingApprovalIds = [...primaryOut.pendingApprovalIds]
  const attachmentNames = [...primaryOut.attachmentsSent]
  const attachments: TelegramAttachmentRef[] = []

  const peerNotes: Array<{ nameAr: string; text: string }> = []
  for (const p of peerOuts) {
    for (const c of p.citations) {
      if (!citations.some((x) => x.labelAr === c.labelAr)) citations.push(c)
    }
    for (const id of p.pendingApprovalIds) {
      if (!pendingApprovalIds.includes(id)) pendingApprovalIds.push(id)
    }
    if (p.text.trim() && p.text.trim() !== primaryOut.text.trim()) {
      peerNotes.push({ nameAr: p.agent.nameAr, text: p.text })
    }
    for (const a of p.attachments) {
      if (!attachments.some((x) => x.fileId === a.fileId)) attachments.push(a)
    }
  }

  // Primary already edited the ack — append peer digests + extra attachments.
  let text = primaryOut.text
  if (peerNotes.length) {
    const digest = peerNotes
      .map((n) => `【${n.nameAr}】 ${n.text.slice(0, 600)}`)
      .join('\n')
    text = `${primaryOut.text}\n\n—\nزملاء الفريق:\n${digest}`.slice(0, 3900)
    try {
      if (opts.placeholderMessageId) {
        await opts.ctx.api.editMessageText(
          opts.ctx.chat!.id,
          opts.placeholderMessageId,
          text
        )
      } else {
        await opts.ctx.reply(text.slice(0, 3900))
      }
    } catch {
      /* ignore edit races */
    }
  }

  if (attachments.length) {
    const extra = await sendAttachmentsToTelegramChat({
      ctx: opts.ctx,
      attachments,
      captionAr: '📎 ناتج زملاء الفريق',
    })
    attachmentNames.push(...extra)
  }

  for (const id of pendingApprovalIds.slice(primaryOut.pendingApprovalIds.length, 4)) {
    await opts.ctx.reply(`موافقة مطلوبة أيضاً (#${id.slice(0, 8)})`, {
      reply_markup: buildApprovalKeyboard(id),
    })
  }

  return {
    text,
    citations,
    pendingApprovalIds,
    attachments: attachments.map((a) => a),
  }
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
  /**
   * full = visible group/DM reply.
   * silent_execute = analyze + run tools; reply only on «ما عرفت/ما حصلت».
   */
  replyMode?: TelegramGroupReplyMode
}) {
  const t0 = Date.now()
  const replyMode = opts.replyMode || 'full'
  const silent = replyMode === 'silent_execute'
  const scopeId = opts.scope.scope.id
  const classified = classifyTelegramWorkIntent(opts.promptSource)
  const work = {
    ...classified,
    forceHeavy: Boolean(opts.forceHeavy) || classified.forceHeavy,
    preferFullAgent: Boolean(opts.forceHeavy) || classified.preferFullAgent,
  }

  // Casual chatter in group without @mention: ingest to feed, stay silent.
  if (silent && isCasualTelegramWork(work.kind) && !opts.forceHeavy) {
    void mirrorChannelTurnToRoom({
      scopeId,
      channel: 'telegram',
      externalId: opts.chatId,
      userLabelAr: opts.ctx.from?.first_name || 'مستخدم تيليجرام',
      userMessageAr: opts.promptSource,
      agentReplyAr: '',
      includeAgentReply: false,
    })
    console.info('[telegram] timing', {
      path: 'silent-casual',
      totalMs: Date.now() - t0,
    })
    return {
      text: '',
      citations: [] as RoomCitation[],
      pendingApprovalIds: [] as string[],
      attachmentsSent: [] as string[],
    }
  }

  const pool = await loadTelegramAgentPool({
    scopeId,
    userId: (await resolveTelegramRequesterUserId(opts.userId)).userId,
  })
  const powered = buildTelegramPowerPrompt({
    raw: opts.promptSource,
    scopeId,
    work,
    catalog: pool.agents,
    collabMode: pool.collabMode,
  })
  const seatIds = powered.wakeAgents.map((a) => a.id)
  const seatId = powered.wakeAgent?.id

  void opts.ctx.replyWithChatAction('typing').catch(() => undefined)

  let ack: { message_id: number } | null = null
  if (!silent) {
    const ackBits: string[] = []
    if (!powered.wakeAgent && powered.wakeNoticeAr) {
      ackBits.push(powered.wakeNoticeAr)
    } else {
      ackBits.push('⏳ استلمت — جاري العمل…')
      if (powered.wakeNoticeAr) ackBits.push(powered.wakeNoticeAr)
      else if (powered.parallel && powered.wakeAgents.length > 1) {
        ackBits.push(
          `الفريق: ${powered.wakeAgents.map((a) => a.nameAr).join('، ')}`
        )
      } else if (powered.wakeAgent) {
        ackBits.push(`المقعد: ${powered.wakeAgent.nameAr}`)
      }
      if (opts.workLabelAr || work.kind !== 'casual') {
        ackBits.push(`القصد: ${opts.workLabelAr || work.labelAr}`)
      }
      if (work.kind === 'file' || work.forceHeavy) {
        ackBits.push('أدوات كاملة (ملفات / Drive / تحويل)')
      }
      if (powered.parallel) {
        ackBits.push(`متوازٍ ×${powered.wakeAgents.length}`)
      }
    }
    ack = await opts.ctx.reply(ackBits.join('\n'))
  }

  // All seats busy
  if (!powered.wakeAgent && powered.wakeNoticeAr) {
    if (!silent && ack) {
      await finalizeTelegramAck({
        ctx: opts.ctx,
        chatId: opts.ctx.chat!.id,
        messageId: ack.message_id,
        text: powered.wakeNoticeAr,
      })
    }
    // Busy notice is operational — allow a short visible line even in silent? User said only mention or unknown. Skip.
    void mirrorChannelTurnToRoom({
      scopeId,
      channel: 'telegram',
      externalId: opts.chatId,
      userLabelAr: opts.ctx.from?.first_name || 'مستخدم تيليجرام',
      userMessageAr: opts.promptSource,
      agentReplyAr: powered.wakeNoticeAr,
      includeAgentReply: !silent,
    })
    return {
      text: powered.wakeNoticeAr,
      citations: [] as RoomCitation[],
      pendingApprovalIds: [] as string[],
      attachmentsSent: [] as string[],
    }
  }

  for (const id of seatIds) markTelegramSeatBusy(scopeId, id)

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
      if (!silent && ack) {
        await finalizeTelegramAck({
          ctx: opts.ctx,
          chatId: opts.ctx.chat!.id,
          messageId: ack.message_id,
          text,
        })
      } else if (silent && !result.ok) {
        await opts.ctx.reply(
          await replyForCapabilityGapAr({
            task: opts.promptSource,
            agentText: text,
          })
        )
      }
      void mirrorChannelTurnToRoom({
        scopeId,
        channel: 'telegram',
        externalId: opts.chatId,
        userLabelAr: opts.ctx.from?.first_name || 'مستخدم تيليجرام',
        userMessageAr: opts.promptSource,
        agentReplyAr: silent && result.ok ? '' : text,
        includeAgentReply: !silent || !result.ok,
      })
      if (!silent) await maybeSendTelegramVoiceReply(opts.ctx, text)
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
      if (!silent && ack) {
        await finalizeTelegramAck({
          ctx: opts.ctx,
          chatId: opts.ctx.chat!.id,
          messageId: ack.message_id,
          text,
        })
      } else if (silent && looksLikeUnknownOrNotFound(text)) {
        await opts.ctx.reply(
          await replyForCapabilityGapAr({
            task: opts.promptSource,
            agentText: text,
          })
        )
      }
      void mirrorChannelTurnToRoom({
        scopeId,
        channel: 'telegram',
        externalId: opts.chatId,
        userLabelAr: opts.ctx.from?.first_name || 'مستخدم تيليجرام',
        userMessageAr: opts.promptSource,
        agentReplyAr:
          silent && !looksLikeUnknownOrNotFound(text) ? '' : text,
        includeAgentReply: !silent || looksLikeUnknownOrNotFound(text),
      })
      console.info('[telegram] timing', {
        path: silent ? 'fast-silent' : 'fast',
        kind: fastKind,
        totalMs: Date.now() - t0,
      })
      if (!silent) await maybeSendTelegramVoiceReply(opts.ctx, text)
      return {
        text,
        citations: [] as RoomCitation[],
        pendingApprovalIds: [] as string[],
        attachmentsSent: [] as string[],
      }
    } catch (e) {
      console.error('[telegram] fast-path', e)
      /* fall through to agent */
    }
  }

  // Specialized assistants — skip posting in silent unless failure
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
      const requesterId = (await resolveTelegramRequesterUserId(opts.userId))
        .userId
      const run = await runAssistant({
        assistantId: routed.assistantId,
        message: opts.promptSource,
        scopeId,
        requesterId,
        skipRequirementCheck: true,
      })
      let text =
        run.blocked?.messageAr ||
        run.text ||
        'لم يُرجع المساعد نصاً.'
      const driveHint = await telegramGoogleLinkedHintAr(requesterId)
      if (driveHint && /drive|درايف|عقل|brain|google/i.test(opts.promptSource)) {
        text = `${text}\n\n${driveHint}`
      }
      if (!silent && ack) {
        await finalizeTelegramAck({
          ctx: opts.ctx,
          chatId: opts.ctx.chat!.id,
          messageId: ack.message_id,
          text,
        })
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
      }
      // silent: execute already done via runAssistant; deliver files/HITL; speak on unknown
      const attachmentsSent = await deliverSilentTelegramResults({
        ctx: opts.ctx,
        attachments: (run.attachments || []).map((a) => ({
          fileId: a.fileId,
          name: a.name,
          mimeType: a.mimeType,
          scopeId: a.scopeId || scopeId,
          toolName: a.toolName,
        })),
        pendingApprovalIds: run.pendingApprovalIds || [],
        workKind: work.kind,
        prompt: opts.promptSource,
      })
      if (looksLikeUnknownOrNotFound(text)) {
        // Fall through to full room agent + free-execute cascade (auto).
        console.info('[telegram] assistant-silent unknown → agent cascade', {
          assistantId: routed.assistantId,
        })
      } else {
      void mirrorChannelTurnToRoom({
        scopeId,
        channel: 'telegram',
        externalId: opts.chatId,
        userLabelAr: opts.ctx.from?.first_name || 'مستخدم تيليجرام',
        userMessageAr: opts.promptSource,
        agentReplyAr: attachmentsSent.length
          ? `أُرسل: ${attachmentsSent.join(' · ')}`
          : '',
        includeAgentReply: attachmentsSent.length > 0,
      })
      console.info('[telegram] timing', {
        path: 'assistant-silent',
        assistantId: routed.assistantId,
        attachments: attachmentsSent.length,
        totalMs: Date.now() - t0,
      })
      return {
        text: '',
        citations: run.citations || [],
        pendingApprovalIds: run.pendingApprovalIds || [],
        attachmentsSent,
      }
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
    work.kind === 'mail' ||
    work.kind === 'question' ||
    isHeavyTelegramPrompt(opts.promptSource)
  const useFullRoomTools =
    work.kind !== 'casual' ||
    work.preferFullAgent ||
    heavy ||
    Boolean(opts.forceHeavy)
  const modelSlug = resolveTelegramModelSlug(heavy, powered.adapt.modelSlug)
  const maxSteps = telegramEffortMaxSteps(
    powered.adapt.effort,
    heavy || useFullRoomTools
  )
  const needDialect = shouldNormalizeTelegramDialect(opts.promptSource)
  const effortHint = effortToRunParams(powered.adapt.effort).systemHintAr

  const tPrep = Date.now()
  const [normalized, requesterResolved, systemBase, chatMemoryAr] =
    await Promise.all([
      normalizeArabicPrompt(powered.prompt, {
        skip: !needDialect,
        modelSlug: needDialect
          ? process.env.TELEGRAM_DIALECT_MODEL?.trim() || 'gemini-2.5-flash'
          : undefined,
      }),
      resolveTelegramRequesterUserId(opts.userId),
      buildScopedSystemPrompt(
        `${TELEGRAM_AGENT_SYSTEM}\n\n${effortHint}`,
        opts.scope
      ),
      import('@/lib/telegram/chat-memory')
        .then((m) =>
          m.buildTelegramGroupChatMemoryAr({
            scopeId,
            chatId: opts.chatId,
            feedLimit: 48,
          })
        )
        .catch(() => ''),
    ])
  const requesterId = requesterResolved.userId
  const driveHint = await telegramGoogleLinkedHintAr(requesterId)
  const system = [
    systemBase,
    driveHint,
    chatMemoryAr,
    'تذكّر: اعتمد ذاكرة المحادثة الكاملة أعلاه واستعن بمقاعد وكيل١…٨ (pool) — لا تنسَ الطلبات السابقة في نفس الشات.',
  ]
    .filter(Boolean)
    .join('\n\n')
  const tools = await bindTelegramTools({
    requesterId,
    scopeId,
    heavy,
    fullRoom: useFullRoomTools,
  })
  const prepMs = Date.now() - tPrep
  const tStream = Date.now()

  const {
    parseTelegramAttachmentFileIds,
    runWithFileSourceLock,
    formatFileSourceLockHint,
  } = await import('@/lib/files/file-source-policy')
  const lockParsed = parseTelegramAttachmentFileIds(
    `${opts.promptSource}\n${normalized.normalizedPromptAr}`
  )
  const lockHint = formatFileSourceLockHint({
    lockedTelegramFileIds: lockParsed.fileIds,
    lockedNames: lockParsed.names,
  })
  const lockedSystem = lockHint ? `${system}\n\n${lockHint}` : system

  const runLocked = async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (!lockParsed.fileIds.length) return fn()
    return runWithFileSourceLock(
      {
        lockedTelegramFileIds: lockParsed.fileIds,
        lockedNames: lockParsed.names,
      },
      fn
    )
  }

  const teamAgents = powered.wakeAgents.length
    ? powered.wakeAgents
    : powered.wakeAgent
      ? [powered.wakeAgent]
      : []
  const useTeam = powered.parallel && teamAgents.length > 1

  if (silent) {
    const silentOut = useTeam
      ? await runTelegramTeamAgentTurn({
          ctx: opts.ctx,
          agents: teamAgents,
          prompt: normalized.normalizedPromptAr,
          systemBase: lockedSystem,
          modelSlug,
          requesterId,
          scopeId,
          maxSteps,
          tools,
          silent: true,
          runLocked,
        })
      : await runLocked(() =>
          runSilentTelegramTools({
            prompt: normalized.normalizedPromptAr,
            system: lockedSystem,
            modelSlug,
            scopeId,
            maxSteps,
            tools,
          })
        )
    const attachmentsSent = await deliverSilentTelegramResults({
      ctx: opts.ctx,
      attachments: silentOut.attachments,
      pendingApprovalIds: silentOut.pendingApprovalIds,
      workKind: work.kind,
      prompt: opts.promptSource,
    })
    const unknown = looksLikeUnknownOrNotFound(silentOut.text)
    if (unknown) {
      const freeOut = await researchThenMaybeFreeExecute({
        task: opts.promptSource,
        agentText: silentOut.text,
        ctx: opts.ctx,
        prompt: normalized.normalizedPromptAr,
        system: lockedSystem,
        modelSlug,
        scopeId,
        maxSteps,
        tools,
        runLocked,
        workKind: work.kind,
      })
      void mirrorChannelTurnToRoom({
        scopeId,
        channel: 'telegram',
        externalId: opts.chatId,
        userLabelAr: opts.ctx.from?.first_name || 'مستخدم تيليجرام',
        userMessageAr: opts.promptSource,
        agentReplyAr: freeOut.text,
      })
      console.info('[telegram] timing', {
        path: useTeam ? 'agent-silent-team-free' : 'agent-silent-free',
        heavy,
        work: work.kind,
        seats: teamAgents.map((a) => a.slug).join(','),
        unknown,
        attachments: freeOut.attachmentsSent.length || attachmentsSent.length,
        prepMs,
        streamMs: Date.now() - tStream,
        totalMs: Date.now() - t0,
      })
      return {
        text: freeOut.text,
        citations: freeOut.citations.length
          ? freeOut.citations
          : silentOut.citations,
        pendingApprovalIds: freeOut.pendingApprovalIds.length
          ? freeOut.pendingApprovalIds
          : silentOut.pendingApprovalIds,
        attachmentsSent: freeOut.attachmentsSent.length
          ? freeOut.attachmentsSent
          : attachmentsSent,
      }
    }
    void mirrorChannelTurnToRoom({
      scopeId,
      channel: 'telegram',
      externalId: opts.chatId,
      userLabelAr: opts.ctx.from?.first_name || 'مستخدم تيليجرام',
      userMessageAr: opts.promptSource,
      agentReplyAr: attachmentsSent.length
        ? `أُرسل: ${attachmentsSent.join(' · ')}`
        : '',
      includeAgentReply: attachmentsSent.length > 0,
    })
    console.info('[telegram] timing', {
      path: useTeam ? 'agent-silent-team' : 'agent-silent',
      heavy,
      work: work.kind,
      seats: teamAgents.map((a) => a.slug).join(','),
      unknown,
      attachments: attachmentsSent.length,
      prepMs,
      streamMs: Date.now() - tStream,
      totalMs: Date.now() - t0,
    })
    return {
      text: '',
      citations: silentOut.citations,
      pendingApprovalIds: silentOut.pendingApprovalIds,
      attachmentsSent,
    }
  }

  if (useTeam) {
    const teamOut = await runTelegramTeamAgentTurn({
      ctx: opts.ctx,
      agents: teamAgents,
      prompt: normalized.normalizedPromptAr,
      systemBase: lockedSystem,
      modelSlug,
      requesterId,
      scopeId,
      maxSteps,
      tools,
      placeholderMessageId: ack?.message_id,
      silent: false,
      runLocked,
    })
    console.info('[telegram] timing', {
      path: 'agent-team',
      heavy,
      work: work.kind,
      seats: teamAgents.map((a) => a.slug).join(','),
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
      agentReplyAr: teamOut.text,
    })
    await maybeSendTelegramVoiceReply(opts.ctx, teamOut.text)
    return {
      text: teamOut.text,
      citations: teamOut.citations,
      pendingApprovalIds: teamOut.pendingApprovalIds,
      attachmentsSent: [],
    }
  }

  const out = await runLocked(() =>
    streamTelegramReply({
      ctx: opts.ctx,
      prompt: normalized.normalizedPromptAr,
      system: lockedSystem,
      modelSlug,
      requesterId,
      scopeId,
      maxSteps,
      tools,
      placeholderMessageId: ack?.message_id,
    })
  )
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
    for (const id of seatIds) markTelegramSeatFree(scopeId, id)
    if (seatId && !seatIds.includes(seatId)) markTelegramSeatFree(scopeId, seatId)
  }
}


export function getTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')
  if (bot) return bot

  bot = new Bot(token)
  installTelegramNeverDeleteGuard(bot)
  void ensureBotCommands(bot)

  // Without this, a throwing handler bubbles out of the webhook as a 500 and
  // Telegram redelivers the same update — the user sees silence, then a burst
  // of repeats. Swallow it here and answer in Arabic instead.
  bot.catch(async (err) => {
    const cause = err.error
    if (cause instanceof TelegramNeverDeleteError) {
      console.error('[telegram] NEVER_DELETE reached handler', cause.method)
    } else {
      console.error('[telegram] unhandled handler error', cause)
    }
    try {
      await err.ctx.reply(
        formatTelegramErrorAr(cause, {
          inGroup: isGroupChat(err.ctx.chat),
          botUsername: err.ctx.me?.username,
        })
      )
    } catch (replyErr) {
      console.error('[telegram] failed to report error to chat', replyErr)
    }
  })

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
          '② بعدها: الطلبات تُنفَّذ صامتة؛ الرد الظاهر عند منشن البوت أو «ما عرفت/ما حصلت».',
          `نادِ ${botTag} لرد كامل في القروب.`,
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
    const pingRaw = matchBotCommand(cmd, 'ping')
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
    const pingCmd =
      pingRaw && commandForThisBot(pingRaw.botTag, botUsername) ? pingRaw : null
    const askCmd =
      askRaw && commandForThisBot(askRaw.botTag, botUsername) ? askRaw : null
    const isKnownCommand = Boolean(
      bindCmd ||
        helpCmd ||
        statusCmd ||
        roomsCmd ||
        approveCmd ||
        pingCmd ||
        askCmd
    )

    if (
      cmd.startsWith('/') &&
      (bindRaw ||
        helpRaw ||
        statusRaw ||
        roomsRaw ||
        approveRaw ||
        pingRaw ||
        askRaw) &&
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

    // /help and /ping work even before /link (onboarding).
    if (pingCmd) {
      await ctx.reply(TELEGRAM_PING_OK_AR)
      return
    }
    if (helpCmd) {
      const privacy = privacyHintAr(botUsername)
      await ctx.reply(
        [buildTelegramHelpAr({ botUsername }), privacy]
          .filter(Boolean)
          .join('\n\n'),
        { reply_markup: buildTelegramHelpMenuKeyboard() }
      )
      return
    }

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
            'أو /help لشرح الاستخدام.',
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
      const payloadRest = bindCmd.args.trim()

      // Personal workspace link: /link account <uuid> or /start account_<uuid>
      const accountMatch =
        payloadRest.match(/^(?:account|me|user)\s+([0-9a-f-]{36})$/i) ||
        payload.match(/^account[_-]([0-9a-f-]{36})$/i)
      if (accountMatch) {
        const linked = await linkTelegramUserToWorkspace({
          tgUserId: userId,
          workspaceUserId: accountMatch[1],
          scopeId: scope.scope.id,
        })
        if (!linked.ok) {
          await ctx.reply(linked.errorAr)
          return
        }
        await ctx.reply(
          [
            '✅ تم ربط حساب تيليجرام بحساب الموقع.',
            'الآن Gmail/Drive الشخصي يستخدمان توكناتك إن ربطت Google من الإعدادات.',
            buildTelegramGoogleConnectHintAr(),
            'جرّب /status أو /help',
          ].join('\n'),
          {
            reply_markup: new InlineKeyboard().url(
              '🔗 اربط Google',
              TELEGRAM_GOOGLE_CONNECT_URL
            ),
          }
        )
        return
      }

      // Bare /start in DM — show ops menu (still binds chat)
      if (
        !payload &&
        !inGroup &&
        (bindCmd.cmd === 'start' || bindCmd.cmd === 'help')
      ) {
        await upsertChannelBinding({
          channel: 'telegram',
          externalId: chatId,
          scopeId: scope.scope.id,
          userId,
        })
        await ctx.reply(
          [
            'مرحباً — بوت Arabic Buzz جاهز كعميل تشغيل كامل.',
            `المساحة: ${scope.scope.nameAr}`,
            'اختر مجالاً أو اكتب طلبك بالعربية مباشرة.',
            '',
            buildTelegramGoogleConnectHintAr(),
          ].join('\n'),
          { reply_markup: buildTelegramHelpMenuKeyboard() }
        )
        return
      }

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
          'أوامر اختيارية: /help · /status · /rooms · /approve · /ping',
        ]
          .filter(Boolean)
          .join('\n')
      )
      return
    }

    if (statusCmd) {
      const pending = await listPendingApprovals().catch(() => [])
      const requester = await resolveTelegramRequesterUserId(userId)
      const googleHint = await telegramGoogleLinkedHintAr(requester.userId).catch(
        () => null
      )
      const personalId = await lookupTelegramWorkspaceUserId(userId).catch(
        () => null
      )
      const personalLinkAr = personalId
        ? `ربط شخصي: نعم (${personalId.slice(0, 8)}…) — Gmail/Drive بهويتك`
        : inGroup
          ? 'ربط شخصي: لا — أدوات Google بهوية مالك القناة. للربط: راسل البوت خاصاً /link account <UUID>'
          : `ربط شخصي: لا — أرسل /link account <UUID-حساب-الموقع> (من الإعدادات). معرّف تيليجرامك: ${userId}`
      const lines = buildTelegramStatusLinesAr({
        chatId,
        inGroup,
        scopeNameAr: scope.scope.nameAr,
        scopeId: scope.scope.id,
        pendingCount: pending.length,
        googleHintAr: googleHint,
        personalLinkAr,
        integrationsAr: [
          `هوية الأدوات: ${requester.source === 'personal' || requester.source === 'env_map' ? 'شخصية' : 'مالك القناة'}`,
          'الإعدادات من تيليجرام: قراءة فقط (/status) — التعديل من الموقع',
        ],
      })
      if (inGroup) {
        const privacy = privacyHintAr(botUsername)
        if (privacy) lines.push(privacy)
      }
      await ctx.reply(lines.join('\n'), {
        reply_markup: new InlineKeyboard()
          .url('🔗 اربط Google', TELEGRAM_GOOGLE_CONNECT_URL)
          .row()
          .text('📋 قائمة الأدوات', 'hm:settings'),
      })
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
    let replyMode: TelegramGroupReplyMode = 'full'
    if (askCmd) {
      if (!askCmd.args) {
        await ctx.reply(
          'اكتب طلبك مباشرة بالعربية — لا حاجة لـ /ask ولا للمنشن. مثال: «أبغى لائحة الجمعية»'
        )
        return
      }
      promptSource = askCmd.args
      replyMode = 'full'
    } else if (inGroup) {
      const gate = shouldHandleGroupText({
        rawText: cmd,
        botUsername,
        isReplyToBot,
        isCommand: false,
        isLinked: Boolean(existingBinding),
      })
      promptSource = gate.promptText
      if (!promptSource.trim()) return
      const addressed = ctxAddressesBot(ctx, botUsername)
      const workKind = classifyTelegramWorkIntent(promptSource).kind
      replyMode = resolveGroupReplyMode({
        inGroup: true,
        mentioned: gate.viaMention || addressed.mentioned,
        isReplyToBot: isReplyToBot || addressed.isReplyToBot,
        workKind,
      })
    }

    // Reply-to user document/photo: ingest that attachment as working copy.
    const replyMsg = ctx.message.reply_to_message
    let replyIngestHint = ''
    try {
      if (replyMsg?.document) {
        const doc = replyMsg.document
        const ingested = await ingestTelegramDocumentToWorkspace({
          ctx,
          scopeId: scope.scope.id,
          fileId: doc.file_id,
          fileName: doc.file_name || `telegram-reply-doc-${Date.now()}`,
          mimeType: doc.mime_type,
          fileSize: doc.file_size,
        })
        const persisted = await persistTelegramAttachment({
          chatId,
          scopeId: scope.scope.id,
          telegramFileId: doc.file_id,
          fileUniqueId: doc.file_unique_id,
          messageId: replyMsg.message_id,
          fileName: ingested.name,
          mimeType: ingested.mimeType,
          sizeBytes: doc.file_size,
          vaultFileId: ingested.fileId,
          hasBytes: true,
        })
        rememberTelegramMedia(chatId, {
          fileId: ingested.fileId,
          name: ingested.name,
          mimeType: ingested.mimeType,
          scopeId: scope.scope.id,
          telegramFileId: doc.file_id,
          messageId: String(replyMsg.message_id),
          fileUniqueId: doc.file_unique_id,
          attachmentPersistId: persisted.id,
        })
        void afterTelegramMediaSaved({
          scopeId: scope.scope.id,
          fileId: ingested.fileId,
          name: ingested.name,
          mimeType: ingested.mimeType,
        })
        replyIngestHint = [
          `مرفق بالرد من تيليجرام: «${ingested.name}» (fileId=${ingested.fileId}, mime=${ingested.mimeType}).`,
          formatDownloadMarker({
            name: ingested.name,
            fileId: ingested.fileId,
            kind: 'file',
          }),
          'هذه نسخة العمل — نفّذ الطلب عليها ثم return_file. Drive اختياري ولا يُشترط. ممنوع طلب إعادة الإرسال.',
        ].join('\n')
      } else if (replyMsg?.photo?.length) {
        const best = replyMsg.photo[replyMsg.photo.length - 1]
        if (best) {
          const ingested = await ingestTelegramPhotoToWorkspace({
            ctx,
            scopeId: scope.scope.id,
            fileId: best.file_id,
          })
          const persisted = await persistTelegramAttachment({
            chatId,
            scopeId: scope.scope.id,
            telegramFileId: best.file_id,
            fileUniqueId: best.file_unique_id,
            messageId: replyMsg.message_id,
            fileName: ingested.name,
            mimeType: ingested.mimeType,
            sizeBytes: best.file_size,
            vaultFileId: ingested.fileId,
            hasBytes: true,
          })
          rememberTelegramMedia(chatId, {
            fileId: ingested.fileId,
            name: ingested.name,
            mimeType: ingested.mimeType,
            scopeId: scope.scope.id,
            telegramFileId: best.file_id,
            messageId: String(replyMsg.message_id),
            fileUniqueId: best.file_unique_id,
            attachmentPersistId: persisted.id,
          })
          void afterTelegramMediaSaved({
            scopeId: scope.scope.id,
            fileId: ingested.fileId,
            name: ingested.name,
            mimeType: ingested.mimeType,
          })
          replyIngestHint = [
            `صورة بالرد من تيليجرام: «${ingested.name}» (fileId=${ingested.fileId}).`,
            formatDownloadMarker({
              name: ingested.name,
              fileId: ingested.fileId,
              kind: 'file',
            }),
            'هذه نسخة العمل — نفّذ ثم return_file. Drive اختياري. ممنوع طلب إعادة الإرسال.',
          ].join('\n')
        }
      }
    } catch (replyIngestErr) {
      console.error('[telegram] reply media ingest', replyIngestErr)
    }

    const workKindForPrompt = classifyTelegramWorkIntent(promptSource).kind
    const needsRecentFile =
      Boolean(replyIngestHint) ||
      workKindForPrompt === 'file' ||
      workKindForPrompt === 'question' ||
      /ملف|مستند|لائح|حو[ّ]?ل|نس[ّ]?ق|عد[ّ]?ل|لخ[ّ]?ص|pdf|word|ورد|صفحة|كرر|انسخ/i.test(
        promptSource
      )

    // Cold-start / new instance: reload last TG attachments from durable store.
    if (needsRecentFile) {
      await hydrateRecentMediaFromPersist(chatId)
    }

    // Auto-resume unfinished file jobs before treating this as a fresh ask.
    // needsRecentFile already covers workKind === 'file' | 'question' (and
    // regex/reply ingest); do not re-compare workKind or TS narrows it away.
    if (needsRecentFile) {
      const resumes = await prepareTelegramFileJobResumes({
        chatId,
        scopeId: scope.scope.id,
        limit: 3,
      })
      for (const note of resumes.notifiedWaiting.slice(0, 1)) {
        try {
          await ctx.reply(note)
        } catch {
          /* ignore */
        }
      }
      if (resumes.ready.length && !replyIngestHint) {
        const r = resumes.ready[0]!
        const linkedRequest = [
          promptSource,
          '',
          r.prompt,
        ].join('\n')
        await updateTelegramFileJob(r.job.id, { status: 'running' })
        try {
          await runTelegramAgentTurn({
            ctx,
            promptSource: linkedRequest,
            chatId,
            userId,
            scope,
            forceHeavy: true,
            replyMode: replyMode === 'silent_execute' ? 'full' : replyMode,
          })
          await updateTelegramFileJob(r.job.id, { status: 'done' })
        } catch (e) {
          await updateTelegramFileJob(r.job.id, {
            status: 'failed',
            lastErrorAr: e instanceof Error ? e.message : String(e),
          })
          throw e
        }
        return
      }
    }

    // Follow-up file work without reply-to: enqueue linked to last persisted media.
    if (
      !replyIngestHint &&
      workKindForPrompt === 'file' &&
      getLatestTelegramMedia(chatId)
    ) {
      const latest = getLatestTelegramMedia(chatId)!
      const dup = inferPdfDuplicateWorkParams(promptSource)
      void enqueueTelegramFileJob({
        chatId,
        scopeId: scope.scope.id,
        userId,
        requestText: promptSource,
        expectedFilename: latest.name,
        vaultFileId: latest.fileId,
        telegramFileId: latest.telegramFileId,
        attachmentId: latest.attachmentPersistId,
        workKind: 'file',
        workParams: dup || {},
        status: 'running',
      })
    }

    const recentHintFresh = formatRecentTelegramMediaHint(chatId)
    if (replyIngestHint || (needsRecentFile && recentHintFresh)) {
      promptSource = [
        promptSource,
        '',
        replyIngestHint || recentHintFresh,
      ]
        .filter(Boolean)
        .join('\n')
      if (replyMode === 'silent_execute' && workKindForPrompt !== 'casual') {
        replyMode = 'full'
      }
      if (replyIngestHint && replyMode === 'silent_execute') {
        replyMode = 'full'
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
        forceHeavy:
          Boolean(replyIngestHint) ||
          workKindForPrompt === 'file' ||
          workKindForPrompt === 'mail',
        replyMode,
      })
    } catch (e) {
      console.error('[telegram] text handler', e)
      // Work requests must never fail silently (even without @mention).
      if (replyMode === 'silent_execute') {
        return
      }
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
    const addressed = ctxAddressesBot(ctx, botUsername)

    try {
      if (inGroup) {
        const binding = await lookupChannelBinding({
          channel: 'telegram',
          externalId: chatId,
        })
        if (!binding) {
          // Unlinked: only nudge when clearly addressing the bot.
          if (!addressed.mentioned && !addressed.isReplyToBot) return
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
        if (addressed.mentioned || addressed.isReplyToBot || !inGroup) {
          await ctx.reply(
            formatTelegramErrorAr('تعذّر ربط المحادثة — جرّب /link', {
              inGroup,
              botUsername,
            })
          )
        }
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

      await ctx.replyWithChatAction('typing')
      const stt = await transcribeArabicSpeech(buffer, mime)
      const transcript = stt.text
      if (!transcript?.trim()) {
        // Voice always expects a response when STT fails — never silent.
        await ctx.reply(
          formatTelegramErrorAr('تعذّر تفريغ الصوت', {
            inGroup,
            botUsername,
          })
        )
        return
      }

      const voiceWork = classifyTelegramWorkIntent(transcript)
      const replyMode = resolveGroupReplyMode({
        inGroup,
        mentioned: addressed.mentioned,
        isReplyToBot: addressed.isReplyToBot,
        workKind: voiceWork.kind,
      })
      const visible = replyMode === 'full'

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
        const tgVoiceId =
          ctx.message.voice?.file_id || ctx.message.audio?.file_id || ''
        const persistedVoice = await persistTelegramAttachment({
          chatId,
          scopeId: scope.scope.id,
          telegramFileId: tgVoiceId || undefined,
          fileUniqueId:
            ctx.message.voice?.file_unique_id ||
            ctx.message.audio?.file_unique_id ||
            undefined,
          messageId: ctx.message.message_id,
          fileName: saved.file.originalName,
          mimeType: mime,
          sizeBytes: buffer.length,
          vaultFileId: saved.file.id,
          hasBytes: true,
        })
        void persistedVoice
        // Also store transcript sidecar for Drive archive search.
        try {
          const side = await saveWorkspaceFile({
            scopeId: scope.scope.id,
            buffer: Buffer.from(transcript, 'utf8'),
            originalName: voiceName.replace(/\.ogg$/i, '') + '-تفريغ.txt',
            mimeType: 'text/plain; charset=utf-8',
          })
          void afterTelegramMediaSaved({
            scopeId: scope.scope.id,
            fileId: side.file.id,
            name: side.file.originalName,
            mimeType: 'text/plain',
          })
        } catch {
          /* non-fatal */
        }
        voiceMarker = formatDownloadMarker({
          name: saved.file.originalName,
          fileId: saved.file.id,
          kind: 'voice',
        })
        void afterTelegramMediaSaved({
          scopeId: scope.scope.id,
          fileId: saved.file.id,
          name: saved.file.originalName,
          mimeType: mime,
        })
      } catch (saveErr) {
        console.error('[telegram] voice save', saveErr)
      }

      rememberVoiceTranscript({
        chatId,
        transcript,
        scopeId: scope.scope.id,
        userId,
      })

      // Casual human chat in group → watch/import only, no interrupt.
      if (!visible) {
        void mirrorChannelTurnToRoom({
          scopeId: scope.scope.id,
          channel: 'telegram',
          externalId: chatId,
          userLabelAr: ctx.from?.first_name || 'مستخدم تيليجرام',
          userMessageAr: `[صوت] ${transcript}`,
          agentReplyAr: '',
          includeAgentReply: false,
        })
        return
      }

      // DM: optional quick buttons. Group actionable: execute immediately (no button lag).
      if (!inGroup) {
        await ctx.reply(
          formatVoiceSttSummaryAr({
            transcript,
            intentLabelAr: voiceWork.labelAr,
            providerLabelAr: stt.providerLabelAr,
          })
        )
        await ctx.reply(VOICE_QUICK_HINT_AR, {
          reply_markup: buildVoiceQuickKeyboard(),
        })
      }

      const recentHint = formatRecentTelegramMediaHint(chatId)
      await hydrateRecentMediaFromPersist(chatId)
      const recentHintFresh = formatRecentTelegramMediaHint(chatId) || recentHint
      if (voiceWork.kind === 'file') {
        const resumes = await prepareTelegramFileJobResumes({
          chatId,
          scopeId: scope.scope.id,
          limit: 2,
        })
        for (const note of resumes.notifiedWaiting.slice(0, 1)) {
          try {
            await ctx.reply(note)
          } catch {
            /* ignore */
          }
        }
        if (resumes.ready.length) {
          const r = resumes.ready[0]!
          await updateTelegramFileJob(r.job.id, { status: 'running' })
          try {
            await runTelegramAgentTurn({
              ctx,
              promptSource: [transcript, '', r.prompt].join('\n'),
              chatId,
              userId,
              scope,
              forceHeavy: true,
              workLabelAr: voiceWork.labelAr,
              replyMode: 'full',
            })
            await updateTelegramFileJob(r.job.id, { status: 'done' })
          } catch (e) {
            await updateTelegramFileJob(r.job.id, {
              status: 'failed',
              lastErrorAr: e instanceof Error ? e.message : String(e),
            })
            throw e
          }
          return
        }
        const latest = getLatestTelegramMedia(chatId)
        if (latest) {
          const dup = inferPdfDuplicateWorkParams(transcript)
          void enqueueTelegramFileJob({
            chatId,
            scopeId: scope.scope.id,
            userId,
            requestText: transcript,
            expectedFilename: latest.name,
            vaultFileId: latest.fileId,
            telegramFileId: latest.telegramFileId,
            workKind: 'file',
            workParams: dup || {},
            status: 'running',
          })
        }
      }
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
              ? '\n[صوت: ملف — نفّذ على مرفق تيليجرام الأخير (fileId) مباشرة ثم return_file — ممنوع طلب إعادة الإرسال إن وُجدت بايتات]'
              : voiceWork.kind === 'mail'
                ? '\n[صوت: بريد — mail_*/gmail_* فوراً ولخّص]'
                : voiceWork.kind === 'message'
                  ? '\n[صوت: رسالة/تبليغ — notify_room_member فوراً]'
                  : '\n[صوت: نفّذ كغرفة الموقع — وكيل١ + أدوات كاملة]',
        recentHintFresh ? `\n${recentHintFresh}` : '',
        voiceMarker
          ? `\n${voiceMarker}\n(صوت محفوظ في مساحة العمل — يمكن سحبه للمساعدين أو غرفة الفريق من المرآة.)`
          : '',
      ]
        .filter(Boolean)
        .join('\n')

      await runTelegramAgentTurn({
        ctx,
        promptSource,
        chatId,
        userId,
        scope,
        forceHeavy:
          voiceWork.forceHeavy ||
          voiceWork.kind === 'question' ||
          voiceWork.kind === 'mail' ||
          voiceWork.kind === 'file',
        workLabelAr: voiceWork.labelAr,
        replyMode: 'full',
      })
    } catch (e) {
      console.error('[telegram] voice', e)
      // Work voice must never fail silently in a linked group.
      try {
        await ctx.reply(
          formatTelegramErrorAr(e, { inGroup, botUsername })
        )
      } catch {
        /* no send permission in group */
      }
    }
  })

  bot.on(['message:document', 'message:photo', 'message:video'], async (ctx) => {
    if (ctx.from?.is_bot) return
    const chatId = String(ctx.chat.id)
    const userId = String(ctx.from?.id || 'user-1')
    const inGroup = isGroupChat(ctx.chat)
    const botUsername = ctx.me.username || ''
    const caption = (ctx.message.caption || '').trim()
    const addressed = ctxAddressesBot(ctx, botUsername)

    try {
      if (inGroup) {
        const binding = await lookupChannelBinding({
          channel: 'telegram',
          externalId: chatId,
        })
        if (!binding) {
          if (!addressed.mentioned && !addressed.isReplyToBot) return
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
        if (!inGroup || addressed.mentioned || addressed.isReplyToBot) {
          await ctx.reply(
            formatTelegramErrorAr('تعذّر ربط المحادثة — جرّب /link', {
              inGroup,
              botUsername,
            })
          )
        }
        return
      }
      void upsertChannelBinding({
        channel: 'telegram',
        externalId: chatId,
        scopeId: scope.scope.id,
        userId,
      })

      await ctx.replyWithChatAction('typing')
      let ingested: { fileId: string; name: string; mimeType: string } | null =
        null
      let telegramFileId = ''
      let fileUniqueId = ''
      let declaredName = ''
      let declaredMime = 'application/octet-stream'
      let declaredSize: number | undefined
      const messageId = ctx.message.message_id

      if (ctx.message.document) {
        const doc = ctx.message.document
        telegramFileId = doc.file_id
        fileUniqueId = doc.file_unique_id || ''
        declaredName = doc.file_name || `telegram-doc-${Date.now()}`
        declaredMime = doc.mime_type || declaredMime
        declaredSize = doc.file_size
        try {
          ingested = await ingestTelegramDocumentToWorkspace({
            ctx,
            scopeId: scope.scope.id,
            fileId: doc.file_id,
            fileName: declaredName,
            mimeType: doc.mime_type,
            fileSize: doc.file_size,
            chatId,
            messageId,
          })
        } catch (dlErr) {
          const persisted = await persistTelegramAttachment({
            chatId,
            scopeId: scope.scope.id,
            telegramFileId,
            fileUniqueId: fileUniqueId || undefined,
            messageId,
            fileName: declaredName,
            mimeType: declaredMime,
            sizeBytes: declaredSize,
            hasBytes: false,
            downloadErrorAr:
              dlErr instanceof Error ? dlErr.message : String(dlErr),
          })
          const dup = inferPdfDuplicateWorkParams(caption)
          // Bind onto existing open job (e.g. نسخ ص48 بعد ص45) — never forget chat intent.
          const { bindOpenJobsToIncomingTelegramFile } = await import(
            '@/lib/telegram/file-jobs'
          )
          await bindOpenJobsToIncomingTelegramFile({
            chatId,
            scopeId: scope.scope.id,
            fileName: declaredName,
            telegramFileId,
            attachmentId: persisted.id,
            sizeBytes: declaredSize,
          })
          const job = await enqueueTelegramFileJob({
            chatId,
            scopeId: scope.scope.id,
            userId,
            requestText: caption || 'أكمل العمل على الملف المرفق',
            expectedFilename: declaredName,
            attachmentId: persisted.id,
            telegramFileId,
            workKind: 'file',
            workParams: dup || {},
            status: 'waiting_file',
          })
          // One operational ack only — never «أعد الإرسال».
          if (isTelegramDownloadLimitError(dlErr)) {
            await ctx.reply(
              telegramLargeFileWorkingPathAr({
                fileName: declaredName,
                sizeBytes: declaredSize,
              })
            )
          }
          // Wake agent pool with full chat memory + job resume prompt when bytes ready.
          const resumes = await prepareTelegramFileJobResumes({
            chatId,
            scopeId: scope.scope.id,
            limit: 6,
          })
          for (const r of resumes.ready) {
            const sameJob = r.job.id === job.id
            const sameName =
              r.job.expectedFilename &&
              declaredName &&
              r.job.expectedFilename === declaredName
            if (!sameJob && !sameName) continue
            await updateTelegramFileJob(r.job.id, { status: 'running' })
            try {
              await runTelegramAgentTurn({
                ctx,
                promptSource: r.prompt,
                chatId,
                userId,
                scope,
                forceHeavy: true,
                workLabelAr: 'ملف',
                replyMode: 'full',
              })
              await updateTelegramFileJob(r.job.id, { status: 'done' })
            } catch (e) {
              await updateTelegramFileJob(r.job.id, {
                status: 'failed',
                lastErrorAr: e instanceof Error ? e.message : String(e),
              })
            }
          }
          return
        }
      } else if (ctx.message.video) {
        const vid = ctx.message.video
        telegramFileId = vid.file_id
        fileUniqueId = vid.file_unique_id || ''
        declaredName = vid.file_name || `telegram-video-${Date.now()}.mp4`
        declaredMime = vid.mime_type || 'video/mp4'
        declaredSize = vid.file_size
        ingested = await ingestTelegramVideoToWorkspace({
          ctx,
          scopeId: scope.scope.id,
          fileId: vid.file_id,
          fileName: declaredName,
          mimeType: declaredMime,
        })
      } else {
        const photos = ctx.message.photo || []
        const best = photos[photos.length - 1]
        if (!best) {
          if (!inGroup || addressed.mentioned || addressed.isReplyToBot) {
            await ctx.reply('لم أجد صورة صالحة.')
          }
          return
        }
        telegramFileId = best.file_id
        fileUniqueId = best.file_unique_id || ''
        declaredName = `telegram-photo-${Date.now()}.jpg`
        declaredMime = 'image/jpeg'
        declaredSize = best.file_size
        ingested = await ingestTelegramPhotoToWorkspace({
          ctx,
          scopeId: scope.scope.id,
          fileId: best.file_id,
        })
      }

      if (!ingested) return

      const persisted = await persistTelegramAttachment({
        chatId,
        scopeId: scope.scope.id,
        telegramFileId: telegramFileId || undefined,
        fileUniqueId: fileUniqueId || undefined,
        messageId,
        fileName: ingested.name,
        mimeType: ingested.mimeType,
        sizeBytes: declaredSize,
        vaultFileId: ingested.fileId,
        hasBytes: true,
      })

      rememberTelegramMedia(chatId, {
        fileId: ingested.fileId,
        name: ingested.name,
        mimeType: ingested.mimeType,
        scopeId: scope.scope.id,
        telegramFileId: telegramFileId || undefined,
        messageId: String(messageId),
        fileUniqueId: fileUniqueId || undefined,
        attachmentPersistId: persisted.id,
      })

      // Drive sync is optional best-effort — never blocks Telegram execute.
      void afterTelegramMediaSaved({
        scopeId: scope.scope.id,
        fileId: ingested.fileId,
        name: ingested.name,
        mimeType: ingested.mimeType,
      })

      void afterVaultFileMaybeRunTelegramJobs({
        chatId,
        scopeId: scope.scope.id,
        vaultFileId: ingested.fileId,
        fileName: ingested.name,
      })

      const { text: captionStripped } = stripBotMention(caption, botUsername)
      const decision = decideTelegramMediaExecute({
        captionOrText: captionStripped,
        inGroup,
        mentioned: addressed.mentioned,
        isReplyToBot: addressed.isReplyToBot,
      })
      assertCaptionWorkMustExecute(captionStripped, decision.shouldExecute)

      const isImage =
        ingested.mimeType.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif|tif{1,2}|bmp)$/i.test(ingested.name)
      const isVideo =
        ingested.mimeType.startsWith('video/') ||
        /\.(mp4|mov|webm|mkv)$/i.test(ingested.name)
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

      // Group bare media (no caption): import + remember only — do not interrupt chat.
      if (!decision.shouldExecute) {
        return
      }

      const dup = inferPdfDuplicateWorkParams(captionStripped)
      const job = await enqueueTelegramFileJob({
        chatId,
        scopeId: scope.scope.id,
        userId,
        requestText: captionStripped || 'اقرأ المرفق ونفّذ المطلوب',
        expectedFilename: ingested.name,
        attachmentId: persisted.id,
        vaultFileId: ingested.fileId,
        telegramFileId,
        workKind: 'file',
        workParams: dup || {},
        status: 'running',
      })

      const userAsk =
        captionStripped ||
        (isVideo
          ? 'استلمت فيديو. لخّص ما يمكن فهمه واقترح الخطوة التالية.'
          : wantsOcr
            ? 'اقرأ النص الظاهر في الصورة/المستند الممسوح واستخرجه، ثم لخّص المطلوب.'
            : 'اقرأ هذا المرفق. إن وُجد طلب في التعليق نفّذه وأعد الملف المعدّل عبر return_file، وإلا لخّص المحتوى باختصار.')

      const ocrHint = wantsOcr
        ? [
            isImage || isPdf
              ? 'هذا مرفق صورة أو PDF — استخدم arabic_ocr مع fileId أعلاه (saveToMemory=true).'
              : 'إن بدا المستند ممسوحاً استخدم arabic_ocr مع fileId.',
            'إن طلب المستخدم البحث عن عبارة، مرّر searchQuery بنفس العبارة.',
            'بعد الاستخراج أعد النص أو مواضع البحث للمستخدم.',
          ].join(' ')
        : isVideo
          ? 'الفيديو محفوظ في أرشيف الغرفة — صف المحتوى المتاح واقترح تحويل/تلخيص إن لزم.'
          : 'ملف تيليجرام = نسخة العمل. استخدم read_document أو read_excel أو convert_document/edit_document حسب الطلب، ثم return_file دائماً. ممنوع انتظار Drive أو القول إن الملف غير موجود لأنه ليس على الدرايف.'

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
        dup
          ? `استدعِ pdf_duplicate_page: copyPage=${dup.copyPage} afterPage=${dup.afterPage} ثم return_file.`
          : '',
        'نفّذ الطلب على هذا fileId مباشرة وأعد الناتج كمرفق تيليجرام. مزامنة Drive اختيارية فقط ولا تمنع التنفيذ. ممنوع طلب إعادة الإرسال.',
      ]
        .filter(Boolean)
        .join('\n')

      try {
        await runTelegramAgentTurn({
          ctx,
          promptSource,
          chatId,
          userId,
          scope,
          forceHeavy: true,
          workLabelAr: decision.workKind === 'casual' ? 'ملف' : decision.workKind,
          replyMode: 'full',
        })
        await updateTelegramFileJob(job.id, { status: 'done' })
      } catch (e) {
        await updateTelegramFileJob(job.id, {
          status: 'failed',
          lastErrorAr: e instanceof Error ? e.message : String(e),
        })
        throw e
      }
    } catch (e) {
      console.error('[telegram] document/photo/video', e)
      // Never silent-fail media ingest in a linked group (size cap / download errors).
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

    const helpMenu = parseHelpMenuCallback(data)
    if (helpMenu) {
      try {
        await ctx.answerCallbackQuery()
      } catch {
        /* ignore */
      }
      if (helpMenu.kind === 'domain') {
        await ctx.reply(buildTelegramHelpDomainAr(helpMenu.domain), {
          reply_markup: buildTelegramHelpMenuKeyboard(),
        })
        return
      }
      if (helpMenu.kind === 'quick' && helpMenu.action === 'brief') {
        const chatId = String(
          ctx.chat?.id || ctx.callbackQuery.message?.chat.id || ''
        )
        const userId = String(ctx.from?.id || 'user-1')
        try {
          const scope = await resolveTelegramScope({
            chatId,
            userId,
            autoBind: true,
          })
          if (!scope) {
            await ctx.reply('تعذّر ربط المحادثة بالغرفة.')
            return
          }
          await runTelegramAgentTurn({
            ctx,
            promptSource: 'إحاطة الصباح — ملخص اليوم كامل',
            chatId,
            userId,
            scope,
            forceHeavy: true,
            workLabelAr: 'إحاطة',
            replyMode: 'full',
          })
        } catch (e) {
          console.error('[telegram] help-brief', e)
          await ctx.reply(formatTelegramErrorAr(e))
        }
        return
      }
    }

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
                : voiceAction === 'mail'
                  ? 'جاري البريد…'
                  : voiceAction === 'message'
                    ? 'جاري إرسال الرسالة…'
                    : voiceAction === 'broadcast'
                      ? 'جاري تبليغ المجموعة…'
                      : voiceAction === 'wake'
                        ? 'جاري إيقاظ الوكيل…'
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
          replyMode: 'full',
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
