/**
 * External workflow bridge — Activepieces / n8n / Trigger.dev webhooks.
 *
 * GitHub refs: activepieces/activepieces · n8n-io/n8n
 */

export type WorkflowResponse = {
  ok: boolean
  status: number
  workflowId: string
  body?: unknown
  messageAr: string
  provider: 'activepieces' | 'n8n' | 'trigger' | 'custom' | 'none'
}

function resolveWebhookUrl(workflowId: string): {
  url: string
  provider: WorkflowResponse['provider']
} | null {
  // Full URL passed as workflowId
  if (/^https?:\/\//i.test(workflowId)) {
    return { url: workflowId, provider: 'custom' }
  }

  const apBase = process.env.ACTIVEPIECES_WEBHOOK_BASE?.replace(/\/$/, '')
  if (apBase) {
    return {
      url: `${apBase}/${encodeURIComponent(workflowId)}`,
      provider: 'activepieces',
    }
  }

  const n8nBase = process.env.N8N_WEBHOOK_BASE?.replace(/\/$/, '')
  if (n8nBase) {
    return {
      url: `${n8nBase}/${encodeURIComponent(workflowId)}`,
      provider: 'n8n',
    }
  }

  const trigger = process.env.TRIGGER_DEV_WEBHOOK_URL?.trim()
  if (trigger) {
    return { url: trigger, provider: 'trigger' }
  }

  const custom = process.env.WORKFLOW_WEBHOOK_URL?.trim()
  if (custom) {
    const url = custom.includes('{id}')
      ? custom.replace('{id}', encodeURIComponent(workflowId))
      : custom
    return { url, provider: 'custom' }
  }

  return null
}

function authHeaders(): Record<string, string> {
  const secret =
    process.env.WORKFLOW_WEBHOOK_SECRET?.trim() ||
    process.env.ACTIVEPIECES_WEBHOOK_SECRET?.trim() ||
    process.env.N8N_WEBHOOK_SECRET?.trim() ||
    process.env.TRIGGER_DEV_WEBHOOK_SECRET?.trim() ||
    ''
  return secret ? { Authorization: `Bearer ${secret}` } : {}
}

/**
 * Dispatch a secure webhook to Activepieces / n8n / Trigger.
 */
export async function triggerExternalWorkflow(
  workflowId: string,
  payload: Record<string, unknown>
): Promise<WorkflowResponse> {
  const id = workflowId.trim()
  if (!id) {
    return {
      ok: false,
      status: 0,
      workflowId: '',
      messageAr: 'يلزم معرّف سير العمل أو رابط الويب هوك.',
      provider: 'none',
    }
  }

  const resolved = resolveWebhookUrl(id)
  if (!resolved) {
    return {
      ok: false,
      status: 0,
      workflowId: id,
      messageAr:
        'جسر الأتمتة غير مفعّل. اضبط ACTIVEPIECES_WEBHOOK_BASE أو N8N_WEBHOOK_BASE أو WORKFLOW_WEBHOOK_URL.',
      provider: 'none',
    }
  }

  try {
    const res = await fetch(resolved.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({
        workflowId: id,
        payload,
        source: 'arabic-buzz',
        createdAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(45_000),
    })
    let body: unknown
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('json')) {
      body = await res.json().catch(() => null)
    } else {
      body = await res.text().catch(() => null)
    }
    return {
      ok: res.ok,
      status: res.status,
      workflowId: id,
      body,
      messageAr: res.ok
        ? `أُرسل الحدث إلى ${resolved.provider}.`
        : `فشل الويب هوك (HTTP ${res.status})`,
      provider: resolved.provider,
    }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      workflowId: id,
      messageAr: e instanceof Error ? e.message : 'فشل إرسال الويب هوك',
      provider: resolved.provider,
    }
  }
}

export function isWorkflowBridgeConfigured() {
  return Boolean(
    process.env.ACTIVEPIECES_WEBHOOK_BASE?.trim() ||
      process.env.N8N_WEBHOOK_BASE?.trim() ||
      process.env.TRIGGER_DEV_WEBHOOK_URL?.trim() ||
      process.env.WORKFLOW_WEBHOOK_URL?.trim()
  )
}
