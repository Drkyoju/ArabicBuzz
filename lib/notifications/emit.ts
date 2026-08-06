export type ApprovalNotificationPayload = {
  approvalId: string
  actionName: string
  params: Record<string, unknown>
  riskLevel: 'LOW' | 'HIGH'
  messageAr: string
  scopeId?: string
}

export type PassiveNotifyPayload = {
  messageAr: string
  actionName: string
}

const uiInbox: Array<ApprovalNotificationPayload | PassiveNotifyPayload> = []

export function getUiNotifications() {
  return [...uiInbox]
}

export function clearUiNotifications() {
  uiInbox.length = 0
}

async function resolveTelegramTarget(meta?: Record<string, unknown>) {
  const explicit =
    process.env.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_TEST_CHAT_ID
  const scopeId = String(
    meta?.scopeId ||
      process.env.TELEGRAM_DEFAULT_SCOPE_ID ||
      'shared-demo'
  )
  const committeeKeyRaw = meta?.committeeKey
    ? String(meta.committeeKey)
    : ''
  const committeeKey =
    committeeKeyRaw === 'finance' ||
    committeeKeyRaw === 'programs' ||
    committeeKeyRaw === 'board'
      ? committeeKeyRaw
      : ''
  if (committeeKey) {
    try {
      const { resolveCommitteeChatId } = await import(
        '@/lib/rooms/committee-channels'
      )
      const cid = await resolveCommitteeChatId(scopeId, committeeKey)
      if (cid) return cid
    } catch {
      /* fall through */
    }
  }
  // Prefer the room's linked chat (/link group) over owner DM env — otherwise
  // site → Telegram always hits TELEGRAM_OWNER_CHAT_ID and never the group.
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/server')
    const { findLatestTelegramChatId } = await import(
      '@/lib/channels/bindings'
    )
    const sb = getSupabaseAdmin()
    if (sb) {
      const { data } = await sb
        .from('channel_bindings')
        .select('external_id')
        .eq('channel', 'telegram')
        .eq('scope_id', scopeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data?.external_id) return String(data.external_id)
    }
    if (explicit) return explicit
    return findLatestTelegramChatId()
  } catch {
    return explicit || ''
  }
}

export async function emitApprovalNotification(
  payload: ApprovalNotificationPayload
): Promise<void> {
  uiInbox.push(payload)
  await sendTelegramApproval(payload)
  await sendWhatsAppApproval(payload)
}

export async function emitPassiveNotification(
  payload: PassiveNotifyPayload
): Promise<void> {
  uiInbox.push(payload)
}

/** Plain outbound text to Telegram or WhatsApp (room → channel). */
export async function emitNotification(opts: {
  channel: 'telegram' | 'whatsapp'
  textAr: string
  to?: string
  meta?: Record<string, unknown>
}): Promise<{ ok: boolean }> {
  if (opts.channel === 'telegram') {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = opts.to || (await resolveTelegramTarget(opts.meta))
    if (!token || !chatId) return { ok: false }
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: opts.textAr }),
      })
      return { ok: true }
    } catch {
      return { ok: false }
    }
  }
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const to =
    opts.to || process.env.WHATSAPP_OWNER_TO || process.env.WHATSAPP_TEST_TO
  if (!token || !phoneId || !to) return { ok: false }
  try {
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: opts.textAr },
      }),
    })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Send a binary document via Telegram Bot API (multipart). */
export async function emitTelegramDocument(opts: {
  buffer: Buffer
  filename: string
  captionAr?: string
  to?: string
  meta?: Record<string, unknown>
}): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = opts.to || (await resolveTelegramTarget(opts.meta))
  if (!token || !chatId) {
    return { ok: false, error: 'تيليجرام غير مضبوط أو لا محادثة مربوطة' }
  }
  try {
    const form = new FormData()
    form.append('chat_id', chatId)
    if (opts.captionAr) form.append('caption', opts.captionAr.slice(0, 1000))
    const blob = new Blob([new Uint8Array(opts.buffer)], {
      type: 'application/octet-stream',
    })
    form.append('document', blob, opts.filename || 'file.bin')
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendDocument`,
      { method: 'POST', body: form }
    )
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { ok: false, error: `Telegram HTTP ${res.status}: ${t.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'فشل إرسال الملف',
    }
  }
}

async function sendTelegramApproval(payload: ApprovalNotificationPayload) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = await resolveTelegramTarget({ scopeId: payload.scopeId })
  if (!token || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${payload.messageAr}\n\nالإجراء: ${payload.actionName}\nالمستوى: ${payload.riskLevel}`,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ موافقة',
                callback_data: 'approve_' + payload.approvalId,
              },
              {
                text: '❌ رفض',
                callback_data: 'reject_' + payload.approvalId,
              },
            ],
          ],
        },
      }),
    })
  } catch (e) {
    console.warn('Telegram notify failed', e)
  }
}

async function sendWhatsAppApproval(payload: ApprovalNotificationPayload) {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const to = process.env.WHATSAPP_OWNER_TO || process.env.WHATSAPP_TEST_TO
  if (!token || !phoneId || !to) return
  const bodyText = `${payload.messageAr}\nالإجراء: ${payload.actionName}\nالمستوى: ${payload.riskLevel}`
  try {
    // Prefer interactive buttons; fall back to plain text if rejected.
    const interactive = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: bodyText.slice(0, 1024) },
            action: {
              buttons: [
                {
                  type: 'reply',
                  reply: {
                    id: `approve_${payload.approvalId}`,
                    title: 'موافقة',
                  },
                },
                {
                  type: 'reply',
                  reply: {
                    id: `reject_${payload.approvalId}`,
                    title: 'رفض',
                  },
                },
              ],
            },
          },
        }),
      }
    )
    if (interactive.ok) return
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: {
          body: `${bodyText}\nرد بـ: موافقة ${payload.approvalId} أو رفض ${payload.approvalId}`,
        },
      }),
    })
  } catch (e) {
    console.warn('WhatsApp notify failed', e)
  }
}
