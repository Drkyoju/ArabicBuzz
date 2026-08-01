import { Bot, InlineKeyboard, InputFile, webhookCallback } from 'grammy'
import { resolveChannelScope } from '@/lib/channels/bindings'
import { DEMO_SCOPES, resolveActiveScope } from '@/lib/scopes/manager'
import { runAgentEngine } from '@/lib/agents/engine'
import { normalizeArabicPrompt } from '@/lib/ai/dialect-parser'
import { resolveApproval } from '@/lib/agents/resolve-approval'
import { handleInboundVoiceNote } from '@/lib/audio/voice-pipeline'
import { updateApprovalInSupabase } from '@/lib/supabase/server'
import { mirrorChannelTurnToRoom } from '@/lib/rooms/channel-mirror'

let bot: Bot | null = null

function resolveTelegramScope(opts: { chatId: string; userId: string }) {
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

export function getTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')
  if (bot) return bot

  bot = new Bot(token)

  bot.on('message:text', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const userId = String(ctx.from?.id || 'user-1')
    const rawText = ctx.message.text || ''

    await ctx.replyWithChatAction('typing')

    const scope = await resolveTelegramScope({ chatId, userId })
    if (!scope) {
      await ctx.reply('عفواً، تعذّر ربط هذه المحادثة بنطاق عمل.')
      return
    }

    try {
      // Dialect normalize (transcribe meaning) → Agent Engine
      const normalized = await normalizeArabicPrompt(rawText)
      const modelSlug =
        process.env.DEFAULT_HARNESS_MODEL || 'gemini-2.0-flash'

      const engine = await runAgentEngine({
        prompt: normalized.normalizedPromptAr,
        system:
          'أنت وكيل Arabic Buzz عبر تيليجرام. أجب بالعربية الفصحى المهنية بإيجاز، واطلب الموافقة عند الإجراءات عالية المخاطر.',
        modelSlug,
        scopeId: scope.scope.id,
        requesterId: userId,
        includeMcpTools: true,
      })

      const reply =
        engine.text?.trim() ||
        'تم استلام رسالتك، لكن لم يُنتَج رد نصي. حاول مرة أخرى.'
      await ctx.reply(reply)
      void mirrorChannelTurnToRoom({
        scopeId: scope.scope.id,
        channel: 'telegram',
        externalId: chatId,
        userLabelAr: ctx.from?.first_name || 'مستخدم تيليجرام',
        userMessageAr: rawText,
        agentReplyAr: reply,
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
    const file = await ctx.getFile()
    const url = `https://api.telegram.org/file/bot${tokenLocal}/${file.file_path}`
    const res = await fetch(url)
    const buffer = Buffer.from(await res.arrayBuffer())
    const scope = await resolveTelegramScope({
      chatId: String(ctx.chat.id),
      userId: String(ctx.from?.id || 'user-1'),
    })
    if (!scope) {
      await ctx.reply('عفواً، تعذّر ربط هذه المحادثة بنطاق عمل.')
      return
    }
    try {
      await ctx.replyWithChatAction('typing')
      const out = await handleInboundVoiceNote({
        channel: 'telegram',
        mediaBuffer: buffer,
        mimeType: 'audio/ogg',
        scopeCtx: scope,
      })
      await ctx.reply(`🎤 تم التحويل:\n${out.transcript}`)
      await ctx.replyWithVoice(new InputFile(out.audioOut, 'reply.ogg'))
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

    const telegramUserId = String(ctx.from?.id || 'telegram')
    const rbacUserId =
      process.env.TELEGRAM_APPROVER_USER_ID || 'user-1'
    const orgId = process.env.TELEGRAM_DEFAULT_ORG_ID || 'org-demo'

    try {
      const result = await resolveApproval({
        approvalId: actionId,
        decision,
        approvedBy: telegramUserId,
        userId: rbacUserId,
        orgId,
      })

      const statusAr =
        result.status === 'APPROVED'
          ? 'تمت الموافقة والتنفيذ'
          : 'تم رفض الإجراء'
      const detailAr =
        result.status === 'APPROVED'
          ? `✅ تمت الموافقة على الإجراء (${actionId}) وتنفيذه بنجاح.`
          : `❌ تم رفض الإجراء (${actionId}). لن يتم التنفيذ.`

      await updateApprovalInSupabase({
        approvalId: actionId,
        status: result.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        resolvedBy: telegramUserId,
        decisionNoteAr: detailAr,
      })

      await ctx.answerCallbackQuery({ text: statusAr })
      await ctx.editMessageText(detailAr, {
        reply_markup: { inline_keyboard: [] },
      })
    } catch (e) {
      console.error('[telegram] callback', e)
      const msg =
        e instanceof Error && e.message === 'MISSING_TENANT_CONTEXT'
          ? 'عفواً، لا تملك الصلاحية الكافية لتنفيذ هذا الإجراء.'
          : 'تعذّر تسجيل قرار الموافقة. حاول مرة أخرى.'
      await ctx.answerCallbackQuery({ text: msg, show_alert: true })
    }
  })

  return bot
}

export function createTelegramWebhookHandler() {
  const instance = getTelegramBot()
  return webhookCallback(instance, 'std/http', {
    secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
  })
}
