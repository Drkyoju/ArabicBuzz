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
  const result = await triggerExternalWorkflow(
    String(body.workflowId || ''),
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
