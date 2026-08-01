import { validateNetworkAccess } from '@/lib/security/airgap'

export async function sendWhatsAppText(to: string, body: string) {
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
      type: 'text',
      text: { body },
    }),
  })
}

export async function sendWhatsAppAudio(to: string, mediaId: string) {
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
