export type ChannelWorkflowKind = 'telegram_webhook' | 'whatsapp_webhook'
import { getDispatchSharedSecret } from '@/lib/workflows/shared-secret'

export async function dispatchChannelWorkflow(opts: {
  kind: ChannelWorkflowKind
  payload: unknown
}) {
  // Only queue when an external worker URL is set (e.g. Trigger.dev).
  // Do NOT self-POST via NEXT_PUBLIC_APP_URL — nested Netlify calls often
  // time out and look like a silent Telegram bot (esp. in groups).
  const endpoint = process.env.TRIGGER_DEV_WEBHOOK_URL?.trim()
  if (!endpoint) return { queued: false as const }

  const secret = getDispatchSharedSecret()
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

