export type ChannelWorkflowKind = 'telegram_webhook' | 'whatsapp_webhook'
import { getDispatchSharedSecret } from '@/lib/workflows/shared-secret'

export async function dispatchChannelWorkflow(opts: {
  kind: ChannelWorkflowKind
  payload: unknown
}) {
  const endpoint =
    process.env.TRIGGER_DEV_WEBHOOK_URL?.trim() ||
    (process.env.NEXT_PUBLIC_APP_URL?.trim()
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}/api/workflows/dispatch`
      : '')
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

