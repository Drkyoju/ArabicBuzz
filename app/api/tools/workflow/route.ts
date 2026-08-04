import { NextRequest, NextResponse } from 'next/server'
import {
  triggerExternalWorkflow,
  isWorkflowBridgeConfigured,
} from '@/lib/tools/workflow-bridge'
import { requireRealUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST { workflowId, payload } — Activepieces / n8n / Trigger webhook. */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as {
    workflowId?: string
    payload?: Record<string, unknown>
  }
  const workflowId = String(body.workflowId || '').trim()
  if (!workflowId || workflowId.length > 200) {
    return NextResponse.json(
      { ok: false, error: 'workflowId مطلوب (حد ٢٠٠ حرف)' },
      { status: 400 }
    )
  }
  if (
    body.payload &&
    JSON.stringify(body.payload).length > 100_000
  ) {
    return NextResponse.json(
      { ok: false, error: 'الحمولة كبيرة جداً' },
      { status: 400 }
    )
  }
  const result = await triggerExternalWorkflow(
    workflowId,
    body.payload && typeof body.payload === 'object' ? body.payload : {}
  )
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

export async function GET() {
  return NextResponse.json({
    configured: isWorkflowBridgeConfigured(),
    messageAr: isWorkflowBridgeConfigured()
      ? 'جسر الأتمتة جاهز.'
      : 'اضبط ACTIVEPIECES_WEBHOOK_BASE أو N8N_WEBHOOK_BASE أو WORKFLOW_WEBHOOK_URL.',
  })
}
