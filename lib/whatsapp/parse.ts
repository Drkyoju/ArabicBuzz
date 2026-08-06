export type WaMessage = {
  from: string
  type: string
  text?: { body?: string }
  audio?: { id?: string }
  interactive?: { button_reply?: { id?: string; title?: string } }
}

/** Meta Cloud API webhook shape. */
function extractMetaMessages(payload: unknown): WaMessage[] {
  const root = payload as {
    entry?: Array<{
      changes?: Array<{ value?: { messages?: WaMessage[] } }>
    }>
  }
  const out: WaMessage[] = []
  for (const e of root.entry || []) {
    for (const c of e.changes || []) {
      for (const m of c.value?.messages || []) out.push(m)
    }
  }
  return out
}

/**
 * Evolution API / Baileys bridge webhook (MESSAGES_UPSERT-like).
 * Accepts several common free-bridge shapes without requiring Meta billing.
 */
function extractBridgeMessages(payload: unknown): WaMessage[] {
  const root = payload as Record<string, unknown>
  const out: WaMessage[] = []

  // Direct WaMessage[] from thin custom bridge
  if (Array.isArray(root.messages)) {
    for (const m of root.messages) {
      if (m && typeof m === 'object' && 'from' in m) out.push(m as WaMessage)
    }
  }

  // Evolution: { event, data: { key, message, pushName } } or data array
  const data = root.data
  const events = Array.isArray(data) ? data : data ? [data] : []
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue
    const e = ev as Record<string, unknown>
    const key = (e.key || {}) as { remoteJid?: string; fromMe?: boolean }
    if (key.fromMe) continue
    const jid = key.remoteJid || ''
    const from = jid.replace(/@.*/g, '').replace(/\D/g, '')
    if (!from) continue
    const msg = (e.message || {}) as Record<string, unknown>
    const conv =
      (msg.conversation as string) ||
      ((msg.extendedTextMessage as { text?: string } | undefined)?.text ?? '')
    const audioId =
      (msg.audioMessage as { mediaKey?: string } | undefined)?.mediaKey ||
      undefined
    if (conv) {
      out.push({ from, type: 'text', text: { body: conv } })
    } else if (audioId) {
      out.push({ from, type: 'audio', audio: { id: String(audioId) } })
    } else if (typeof e.body === 'string' && e.body) {
      out.push({ from, type: 'text', text: { body: e.body } })
    }
  }

  // Thin bridge: { from, text } / { from, body }
  if (typeof root.from === 'string') {
    const body =
      (typeof root.text === 'string' && root.text) ||
      (typeof root.body === 'string' && root.body) ||
      ''
    if (body) {
      out.push({
        from: root.from.replace(/\D/g, ''),
        type: 'text',
        text: { body },
      })
    }
  }

  return out
}

export function extractWhatsAppMessages(payload: unknown): WaMessage[] {
  const meta = extractMetaMessages(payload)
  if (meta.length) return meta
  return extractBridgeMessages(payload)
}
