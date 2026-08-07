import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import {
  enqueueAssistantJob,
  listAssistantJobs,
} from '@/lib/assistants/queue'
import {
  assistantParallelHintAr,
  getAssistantMaxParallel,
  getAssistantMaxPerUser,
} from '@/lib/assistants/parallel'
import { parseRunEffort } from '@/lib/ai/run-effort'

export const dynamic = 'force-dynamic'

/**
 * GET ?scopeId= — list queue for room (waiting / running / recent done).
 * POST { message, scopeId?, assistantId?, modelSlug?, effortLevel? } — enqueue.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const scopeId =
    req.nextUrl.searchParams.get('scopeId')?.trim() || 'shared-demo'
  const jobs = await listAssistantJobs(scopeId, { limit: 60 })
  const maxParallel = getAssistantMaxParallel()
  const maxPerUser = getAssistantMaxPerUser()

  return NextResponse.json({
    ok: true,
    scopeId,
    maxParallel,
    maxPerUser,
    hintAr: assistantParallelHintAr(maxPerUser),
    jobs,
    counts: {
      waiting: jobs.filter((j) => j.status === 'waiting').length,
      running: jobs.filter((j) => j.status === 'running').length,
      done: jobs.filter((j) => j.status === 'done').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
    },
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  let body: {
    message?: string
    prompt?: string
    scopeId?: string
    assistantId?: string
    modelSlug?: string
    effortLevel?: string
    effort?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 })
  }

  const message = String(body.message || body.prompt || '').trim()
  if (!message) {
    return NextResponse.json(
      { error: 'اكتب ما تريده بالعربية' },
      { status: 400 }
    )
  }

  const scopeId = String(body.scopeId || 'shared-demo').trim() || 'shared-demo'
  const effortLevel = parseRunEffort(body.effortLevel || body.effort)
  const modelSlug = body.modelSlug ? String(body.modelSlug).trim() : null

  try {
    const { job, maxParallel, maxPerUser } = await enqueueAssistantJob({
      scopeId,
      userId: auth.user.id,
      message,
      assistantId: body.assistantId ? String(body.assistantId) : null,
      modelSlug,
      effortLevel,
    })

    return NextResponse.json({
      ok: true,
      job,
      maxParallel,
      maxPerUser,
      hintAr: assistantParallelHintAr(maxPerUser),
    })
  } catch (e) {
    console.error('[assistants/queue]', e)
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : 'تعذّر إضافة المهمة للطابور',
      },
      { status: 500 }
    )
  }
}
