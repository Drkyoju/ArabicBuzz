export type WaMessage = {
  from: string
  type: string
  text?: { body?: string }
  audio?: { id?: string }
  interactive?: { button_reply?: { id?: string; title?: string } }
}

export function extractWhatsAppMessages(payload: unknown): WaMessage[] {
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
