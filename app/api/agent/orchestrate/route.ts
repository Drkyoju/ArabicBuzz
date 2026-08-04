import { NextRequest, NextResponse } from 'next/server'
import { orchestrateParallelWorkflow } from '@/lib/agents/orchestrator'
import { DEMO_SCOPES, resolveActiveScope } from '@/lib/scopes/manager'
import { requireRealUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const MAX_PROMPT_LENGTH = 20_000

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = await req.json()
  const prompt = String(body.prompt || '')
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: 'النص المُدخل طويل جدًا' },
      { status: 400 }
    )
  }
  const scopeId = String(body.scopeId || 'shared-demo')
  const userId = auth.user.id
  resolveActiveScope({ userId, scopeId, scopes: DEMO_SCOPES })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        )
      }
      try {
        const result = await orchestrateParallelWorkflow(prompt, scopeId, {
          onEvent: send,
          modelSlug: body.modelSlug,
        })
        send({ type: 'done', finalReplyAr: result.finalReplyAr })
      } catch (e) {
        send({
          type: 'error',
          message: e instanceof Error ? e.message : 'error',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
