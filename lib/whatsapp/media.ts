import { validateNetworkAccess } from '@/lib/security/airgap'

export async function downloadMetaMedia(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = process.env.WHATSAPP_TOKEN
  if (!token) throw new Error('WHATSAPP_TOKEN missing')
  const metaUrl = `https://graph.facebook.com/v20.0/${mediaId}`
  validateNetworkAccess(metaUrl)
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!metaRes.ok) throw new Error('Failed to resolve media URL')
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string }
  if (!meta.url) throw new Error('Missing media URL')
  validateNetworkAccess(meta.url)
  const binRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!binRes.ok) throw new Error('Failed to download media')
  return {
    buffer: Buffer.from(await binRes.arrayBuffer()),
    mimeType: meta.mime_type || 'audio/ogg',
  }
}

export async function uploadMetaMedia(
  buffer: Buffer,
  mimeType: string,
  filename = 'reply.ogg'
): Promise<string> {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) throw new Error('WhatsApp env missing')
  const url = `https://graph.facebook.com/v20.0/${phoneId}/media`
  validateNetworkAccess(url)
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', mimeType)
  form.append(
    'file',
    new Blob([Uint8Array.from(buffer)], { type: mimeType }),
    filename
  )
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) throw new Error('Failed to upload media')
  const data = (await res.json()) as { id?: string }
  if (!data.id) throw new Error('Missing uploaded media id')
  return data.id
}
