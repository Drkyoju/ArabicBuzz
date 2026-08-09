/**
 * Free WhatsApp path — Evolution API / Baileys self-host bridge.
 *
 * Netlify cannot hold a WhatsApp Web session. When WHATSAPP_BRIDGE_URL is set,
 * outbound goes to the bridge REST API (no Meta Cloud billing).
 * Inbound: bridge POSTs to /api/webhooks/whatsapp (Meta-shaped or Evolution).
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { validateNetworkAccess } from '@/lib/security/airgap'

export type WhatsAppTransport = 'none' | 'bridge' | 'meta_cloud'

export function whatsappBridgeUrl(): string | null {
  return process.env.WHATSAPP_BRIDGE_URL?.trim().replace(/\/$/, '') || null
}

export function whatsappBridgeSecret(): string | null {
  return process.env.WHATSAPP_BRIDGE_SECRET?.trim() || null
}

export function whatsappBridgeInstance(): string {
  return process.env.WHATSAPP_BRIDGE_INSTANCE?.trim() || 'arabicbuzz'
}

/** Prefer free bridge; Meta Cloud only if explicitly configured (may bill). */
export function resolveWhatsAppTransport(): WhatsAppTransport {
  if (whatsappBridgeUrl()) return 'bridge'
  if (
    process.env.WHATSAPP_TOKEN?.trim() &&
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  ) {
    return 'meta_cloud'
  }
  return 'none'
}

export function whatsappTransportStatusAr(): {
  transport: WhatsAppTransport
  ready: boolean
  detailAr: string
} {
  const transport = resolveWhatsAppTransport()
  if (transport === 'bridge') {
    return {
      transport,
      ready: true,
      detailAr:
        'جسر مجاني مضبوط (Evolution/Baileys) — الجلسة على جهازك أو VPS، وليس داخل حاوية CranL',
    }
  }
  if (transport === 'meta_cloud') {
    return {
      transport,
      ready: true,
      detailAr:
        'مسار Meta Cloud مضبوط — قد يترتب عليه فوترة؛ للجسر المجاني استخدم WHATSAPP_BRIDGE_URL',
    }
  }
  return {
    transport,
    ready: false,
    detailAr:
      'واتساب الموقع معطّل بالسياسة — هيرميس (وقف واتساب) منفصل؛ الجمعية = تيليجرام + الموقع + الوكلاء',
  }
}

export function verifyWhatsAppBridgeSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = whatsappBridgeSecret()
  if (!secret) return true // open bridge (dev) — still rate-limited at webhook
  if (!signatureHeader) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const got = signatureHeader.replace(/^sha256=/i, '').trim()
  try {
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(got, 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Send text via Evolution-compatible REST:
 * POST {BRIDGE}/message/sendText/{instance}
 * Body: { number, text }
 */
export async function sendViaWhatsAppBridge(
  to: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  const base = whatsappBridgeUrl()
  if (!base) return { ok: false, error: 'WHATSAPP_BRIDGE_URL غير مضبوط' }

  const instance = whatsappBridgeInstance()
  const url = `${base}/message/sendText/${encodeURIComponent(instance)}`
  validateNetworkAccess(url)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const secret = whatsappBridgeSecret()
  if (secret) {
    headers.apikey = secret
    headers.Authorization = `Bearer ${secret}`
  }

  const digits = to.replace(/\D/g, '')
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        number: digits,
        text: body,
        /** Evolution v2 alternate shape */
        textMessage: { text: body },
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return {
        ok: false,
        error: `جسر واتساب HTTP ${res.status}: ${t.slice(0, 120)}`,
      }
    }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'فشل الاتصال بالجسر',
    }
  }
}
