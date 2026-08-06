import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy'
import { streamText, stepCountIs, type ToolSet } from 'ai'
import {
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
import { handleInboundVoiceNote } from '@/lib/audio/voice-pipeline'
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

let bot: Bot | null = null
let botInitPromise: Promise<void> | null = null

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

function resolveTelegramScope(opts: {
  chatId: string
  userId: string
  preferredScopeId?: string
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
  }).then((scope) => {
    if (scope) return scope
    return resolveActiveScope({
      userId: opts.userId,
      scopeId: process.env.TELEGRAM_DEFAULT_SCOPE_ID || 'shared-demo',
      scopes: DEMO_SCOPES,
    })
  })
}

/** Inline keyboard: ✅ موافقة / ❌ رفض with approve_/reject_ callback data. */
export function buildApprovalKeyboard(actionId: string) {
  return new InlineKeyboard()
    .text('✅ موافقة', 'approve_' + actionId)
    .text('❌ رفض', 'reject_' + actionId)
}

async function bindTelegramTools(opts: {
  requesterId: string
  scopeId: string
}): Promise<ToolSet> {
  const { parsePosture } = await import('@/lib/security/posture')
  const native = getNativeAiTools({
    requesterId: opts.requesterId,
    scopeId: opts.scopeId,
    mode: parsePosture('DANGEROUS'),
  })
  let mcpTools: ToolSet = {}
  try {
    await connectEnvMcpServers()
    mcpTools = await getMCPHostManager().getCombinedToolSet()
  } catch {
    /* optional */
  }
  return { ...native, ...mcpTools }
}

async function streamTelegramReply(opts: {
  ctx: Context
  prompt: string
  system: string
  modelSlug: string
  requesterId: string
  scopeId: string
}): Promise<{
  text: string
  citations: RoomCitation[]
  pendingApprovalIds: string[]
}> {
  await opts.ctx.replyWithChatAction('typing')
  const placeholder = await opts.ctx.reply('جاري التفكير…')
  const tools = await bindTelegramTools({
    requesterId: opts.requesterId,
    scopeId: opts.scopeId,
  })

  const citations: RoomCitation[] = []
  const pendingApprovalIds: string[] = []
  let assembled = ''
  let lastEdit = 0

  const result = streamText({
    model: getHarnessModel(opts.modelSlug),
    system: opts.system,
    prompt: opts.prompt,
    tools,
    stopWhen: stepCountIs(5),
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
        if (now - lastEdit > 1000 && assembled.trim()) {
          lastEdit = now
          try {
            await opts.ctx.api.editMessageText(
              opts.ctx.chat!.id,
              placeholder.message_id,
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
      }
    }
  } catch (e) {
    console.error('[telegram] stream', e)
  }

  const finalText = (await result.text)?.trim() || assembled.trim()
  const stepsExtract = extractFromAgentSteps(await result.steps)
  for (const c of stepsExtract.citations) {
    if (!citations.some((x) => x.labelAr === c.labelAr)) citations.push(c)
  }
  for (const id of stepsExtract.pendingApprovalIds) {
    if (!pendingApprovalIds.includes(id)) pendingApprovalIds.push(id)
  }

  const body =
    (finalText || 'تم استلام رسالتك، لكن لم يُنتَج رد نصي.') +
    formatCitationsFooterAr(citations)

  const firstApproval = pendingApprovalIds[0]
  try {
    await opts.ctx.api.editMessageText(
      opts.ctx.chat!.id,
      placeholder.message_id,
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

  return { text: body, citations, pendingApprovalIds }
}

export function getTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')
  if (bot) return bot

  bot = new Bot(token)

  bot.on('message:text', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const userId = String(ctx.from?.id || 'user-1')
    const rawText = ctx.message.text || ''
    const cmd = rawText.trim()

    await ctx.replyWithChatAction('typing')

    const scope = await resolveTelegramScope({ chatId, userId })
    if (!scope) {
      await ctx.reply('عفواً، تعذّر ربط هذه المحادثة بنطاق عمل.')
      return
    }

    void upsertChannelBinding({
      channel: 'telegram',
      externalId: chatId,
      scopeId: scope.scope.id,
      userId,
    })

    if (/^\/(start|owner|معرف|id)(?:@\w+)?(?:\s+(\S+))?$/i.test(cmd)) {
      const startMatch = cmd.match(
        /^\/(?:start|owner|معرف|id)(?:@\w+)?(?:\s+(\S+))?$/i
      )
      const payload = (startMatch?.[1] || '').trim()
      let boundScopeId = scope.scope.id
      let boundName = scope.scope.nameAr
      if (payload) {
        // Deep link: /start scope_<id> or /start scope_<id>__c_<committee>
        const {
          parseCommitteeStartPayload,
          upsertCommitteeChannel,
          COMMITTEE_LABELS_AR,
        } = await import('@/lib/rooms/committee-channels')
        const parsed = parseCommitteeStartPayload(payload)
        const scopeId = parsed?.scopeId || payload.replace(/^scope[_-]/i, '')
        const resolved = await resolveTelegramScope({
          chatId,
          userId,
          preferredScopeId: scopeId,
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
                'الرسائل هنا تظهر في نفس الغرفة على الموقع.',
              ].join('\n')
            )
            return
          }
        }
      }
      await ctx.reply(
        [
          'مرحباً — بوت Arabic Buzz جاهز.',
          `معرّف هذه المحادثة: ${chatId}`,
          `المساحة: ${boundName}`,
          payload ? 'تم ربط هذه المحادثة عبر رابط الدعوة.' : '',
          'أوامر: /help · /rooms · /approve · /status',
          'أضفه في Netlify كـ TELEGRAM_OWNER_CHAT_ID إن أردت تثبيت مالك التنبيهات.',
        ]
          .filter(Boolean)
          .join('\n')
      )
      return
    }

    if (/^\/help(?:@\w+)?$/i.test(cmd)) {
      await ctx.reply(
        [
          'بوت Arabic Buzz — بوت واحد يكفي (لا حاجة لبوت ثانٍ).',
          '',
          'الأوامر:',
          '/help — هذه القائمة',
          '/start — معرّف المحادثة وربط المساحة',
          '/rooms — المساحة المربوطة حالياً',
          '/approve — عرض الموافقات المعلّقة مع أزرار القرار',
          '/status — حالة الربط والإعداد',
          '',
          'محادثة خاصة: للتنبيهات والأوامر الشخصية.',
          'مجموعة: أضف البوت ثم افتح رابط الدعوة من الإعدادات → لجان.',
          '',
          'ماذا يفعل البوت؟',
          '• دردشة نصية مع الوكيل (أدوات + معرفة)',
          '• رسائل صوتية → تفريغ ورد',
          '• تنبيهات موافقة بشرية مع ✅ موافقة / ❌ رفض',
          '• عند الموافقة يُنفَّذ الإجراء المعلّق فعلياً',
          '',
          'أرسل أي نص غير أمر ليُعالَج كطلب للوكيل.',
        ].join('\n')
      )
      return
    }

    if (/^\/status(?:@\w+)?$/i.test(cmd)) {
      const pending = await listPendingApprovals().catch(() => [])
      await ctx.reply(
        [
          'حالة Arabic Buzz عبر تيليجرام:',
          `المحادثة: ${chatId}`,
          `المساحة: ${scope.scope.nameAr} (${scope.scope.id})`,
          `موافقات معلّقة: ${pending.length}`,
          'الوكيل: جاهز لاستقبال النص والصوت',
          'الموقع: https://arabicbuzz.netlify.app/',
        ].join('\n')
      )
      return
    }

    if (/^\/rooms(?:@\w+)?$/i.test(cmd)) {
      await ctx.reply(
        [
          `المساحة النشطة: ${scope.scope.nameAr}`,
          `المعرّف: ${scope.scope.id}`,
          'غيّر الربط من الموقع أو بمراسلة البوت من حساب مرتبط.',
          'أوامر أخرى: /help · /approve · /status',
        ].join('\n')
      )
      return
    }

    if (/^\/approve(?:@\w+)?$/i.test(cmd)) {
      try {
        const pending = await listPendingApprovals()
        if (!pending.length) {
          await ctx.reply('لا موافقات معلّقة حالياً.')
          return
        }
        await ctx.reply(`موافقات معلّقة: ${pending.length}`)
        for (const a of pending.slice(0, 5)) {
          await ctx.reply(
            `الإجراء: ${a.actionName}\nالمستوى: ${a.riskLevel}\n#${a.approvalId.slice(0, 8)}`,
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

    try {
      const normalized = await normalizeArabicPrompt(rawText)
      const modelSlug =
        process.env.DEFAULT_HARNESS_MODEL || 'gemini-3.1-pro'
      const requesterId = await resolveChannelOwnerUserIdAsync(userId)
      const system = await buildScopedSystemPrompt(
        'أنت وكيل Arabic Buzz عبر تيليجرام. أجب بالعربية الفصحى المهنية بإيجاز. عند استخدام قاعدة المعرفة اذكر المصادر. اطلب الموافقة عند الإجراءات عالية المخاطر.',
        scope
      )

      const out = await streamTelegramReply({
        ctx,
        prompt: normalized.normalizedPromptAr,
        system,
        modelSlug,
        requesterId,
        scopeId: scope.scope.id,
      })

      void mirrorChannelTurnToRoom({
        scopeId: scope.scope.id,
        channel: 'telegram',
        externalId: chatId,
        userLabelAr: ctx.from?.first_name || 'مستخدم تيليجرام',
        userMessageAr: rawText,
        agentReplyAr: out.text,
      })
    } catch (e) {
      console.error('[telegram] text handler', e)
      await ctx.reply(
        e instanceof Error
          ? `تعذّر معالجة الرسالة: ${e.message}`
          : 'تعذّر معالجة الرسالة حالياً.'
      )
    }
  })

  bot.on(['message:voice', 'message:audio'], async (ctx) => {
    const tokenLocal = process.env.TELEGRAM_BOT_TOKEN!
    const chatId = String(ctx.chat.id)
    const userId = String(ctx.from?.id || 'user-1')
    const file = await ctx.getFile()
    const url = `https://api.telegram.org/file/bot${tokenLocal}/${file.file_path}`
    const res = await fetch(url)
    const buffer = Buffer.from(await res.arrayBuffer())
    const scope = await resolveTelegramScope({ chatId, userId })
    if (!scope) {
      await ctx.reply('عفواً، تعذّر ربط هذه المحادثة بنطاق عمل.')
      return
    }
    void upsertChannelBinding({
      channel: 'telegram',
      externalId: chatId,
      scopeId: scope.scope.id,
      userId,
    })
    try {
      await ctx.replyWithChatAction('typing')
      const out = await handleInboundVoiceNote({
        channel: 'telegram',
        mediaBuffer: buffer,
        mimeType: 'audio/ogg',
        scopeCtx: scope,
      })
      await ctx.reply(`🎤 تم التحويل:\n${out.transcript}`)
      if (out.replyText?.trim()) {
        await ctx.reply(out.replyText.slice(0, 4000))
      }
      await ctx.replyWithVoice(new InputFile(out.audioOut, 'reply.ogg'))
      void mirrorChannelTurnToRoom({
        scopeId: scope.scope.id,
        channel: 'telegram',
        externalId: chatId,
        userLabelAr: ctx.from?.first_name || 'مستخدم تيليجرام',
        userMessageAr: `🎤 ${out.transcript}`,
        agentReplyAr: out.replyText || out.transcript,
      })
    } catch (e) {
      await ctx.reply(e instanceof Error ? e.message : 'تعذر معالجة الصوت')
    }
  })

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data || ''
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

    // Answer immediately so Telegram stops the spinner even if execution is slow.
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
    // Director email so high-risk approvals pass RBAC even if Prisma membership is down.
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
  const instance = await ensureTelegramBotReady()
  const update = payload as Parameters<typeof instance.handleUpdate>[0]
  await instance.handleUpdate(update)
}
