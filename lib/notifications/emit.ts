export type ApprovalNotificationPayload = {
  approvalId: string
  actionName: string
  params: Record<string, unknown>
  riskLevel: 'LOW' | 'HIGH'
  messageAr: string
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
  meta?: Record<string, unknown>
}): Promise<{ ok: boolean }> {
  if (opts.channel === 'telegram') {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_TEST_CHAT_ID
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
  const to = process.env.WHATSAPP_TEST_TO
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

async function sendTelegramApproval(payload: ApprovalNotificationPayload) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_TEST_CHAT_ID
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
  const to = process.env.WHATSAPP_TEST_TO
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
