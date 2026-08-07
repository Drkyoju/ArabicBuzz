import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import {
  enqueueAssistantJob,
  listAssistantJobs,
} from '@/lib/assistants/queue'
import {
  assistantParallelHintAr,
  getAssistantMaxParallel,
} from '@/lib/assistants/parallel'

export const dynamic = 'force-dynamic'

/**
 * GET ?scopeId= — list queue for room (waiting / running / recent done).
 * POST { message, scopeId?, assistantId? } — enqueue; intent router picks worker.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const scopeId =
    req.nextUrl.searchParams.get('scopeId')?.trim() || 'shared-demo'
  const jobs = await listAssistantJobs(scopeId, { limit: 60 })
  const maxParallel = getAssistantMaxParallel()

  return NextResponse.json({
    ok: true,
    scopeId,
    maxParallel,
    hintAr: assistantParallelHintAr(maxParallel),
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

  try {
    const { job, maxParallel } = await enqueueAssistantJob({
      scopeId,
      userId: auth.user.id,
      message,
      assistantId: body.assistantId ? String(body.assistantId) : null,
    })

    return NextResponse.json({
      ok: true,
      job,
      maxParallel,
      hintAr: assistantParallelHintAr(maxParallel),
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
