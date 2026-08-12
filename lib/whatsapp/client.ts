import { validateNetworkAccess } from '@/lib/security/airgap'
import {
  resolveWhatsAppTransport,
  sendViaWhatsAppBridge,
} from '@/lib/whatsapp/bridge'

/**
 * Outbound WhatsApp text.
 * Prefer free self-host bridge (WHATSAPP_BRIDGE_URL). Meta Cloud only if no bridge.
 */
export async function sendWhatsAppText(to: string, body: string) {
  const transport = resolveWhatsAppTransport()
  if (transport === 'bridge') {
    const result = await sendViaWhatsAppBridge(to, body)
    if (!result.ok) {
      throw new Error(result.error || 'فشل إرسال واتساب عبر الجسر')
    }
    return
  }
  if (transport !== 'meta_cloud') {
    throw new Error(
      'واتساب غير مضبوط — عيّن WHATSAPP_BRIDGE_URL (جسر مجاني) أو مسار Meta Cloud صراحة'
    )
  }

  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) {
    throw new Error('WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID ناقص')
  }
  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`
  validateNetworkAccess(url)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Meta WhatsApp HTTP ${res.status}: ${t.slice(0, 120)}`)
  }
}

export async function sendWhatsAppAudio(to: string, mediaId: string) {
  // Bridge media varies by Evolution version — text fallback path is primary MVP.
  const transport = resolveWhatsAppTransport()
  if (transport === 'bridge') {
    await sendViaWhatsAppBridge(
      to,
      '📩 وصل ملف صوتي — افتح التطبيق أو أعد الإرسال كنص.'
    )
    return
  }
  if (transport !== 'meta_cloud') return

  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) return
  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`
  validateNetworkAccess(url)
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: { id: mediaId },
    }),
  })
}

export async function sendApprovalButtons(to: string, approvalId: string, text: string) {
  await sendWhatsAppText(
    to,
    `${text}\n\nللموافقة أرسل: APPROVE ${approvalId}\nللرفض أرسل: REJECT ${approvalId}`
  )
}
