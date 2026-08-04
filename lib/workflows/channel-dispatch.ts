export type ChannelWorkflowKind = 'telegram_webhook' | 'whatsapp_webhook'

export async function dispatchChannelWorkflow(opts: {
  kind: ChannelWorkflowKind
  payload: unknown
}) {
  const endpoint = process.env.TRIGGER_DEV_WEBHOOK_URL?.trim()
  if (!endpoint) return { queued: false as const }

  const secret = process.env.TRIGGER_DEV_WEBHOOK_SECRET?.trim()
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({
      kind: opts.kind,
      payload: opts.payload,
      createdAt: new Date().toISOString(),
    }),
  })
  return { queued: res.ok, status: res.status }
}

