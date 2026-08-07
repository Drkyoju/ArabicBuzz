import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import { runAssistant } from '@/lib/assistants/run'
import {
  claimAssistantJob,
  completeAssistantJob,
  listAssistantJobs,
} from '@/lib/assistants/queue'
import {
  assistantParallelHintAr,
  getAssistantMaxParallel,
} from '@/lib/assistants/parallel'
import { parsePosture } from '@/lib/security/posture'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST { jobId?, scopeId? } — claim a waiting job (or oldest) and run it.
 * Client keeps up to ASSISTANT_MAX_PARALLEL process calls in flight.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  let body: { jobId?: string; scopeId?: string; securityPosture?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 })
  }

  const scopeId = String(body.scopeId || 'shared-demo').trim() || 'shared-demo'
  const maxParallel = getAssistantMaxParallel()
  let jobId = body.jobId ? String(body.jobId).trim() : ''

  if (!jobId) {
    const jobs = await listAssistantJobs(scopeId, {
      includeDone: false,
      limit: 40,
    })
    const next = jobs.find((j) => j.status === 'waiting')
    if (!next) {
      return NextResponse.json({
        ok: true,
        idle: true,
        maxParallel,
        hintAr: assistantParallelHintAr(maxParallel),
      })
    }
    jobId = next.id
  }

  const claimed = await claimAssistantJob(jobId, scopeId)
  if (!claimed.ok) {
    if (claimed.reason === 'at_capacity') {
      return NextResponse.json(
        {
          ok: false,
          atCapacity: true,
          maxParallel,
          hintAr: assistantParallelHintAr(maxParallel),
          job: claimed.job,
        },
        { status: 409 }
      )
    }
    if (claimed.reason === 'not_found') {
      return NextResponse.json({ error: 'المهمة غير موجودة' }, { status: 404 })
    }
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: claimed.reason,
      job: claimed.job,
      maxParallel,
    })
  }

  const job = claimed.job
  const mode = parsePosture(
    body.securityPosture || process.env.DEFAULT_SECURITY_POSTURE
  )

  try {
    const result = await runAssistant({
      assistantId: job.assistantId,
      message: job.message,
      scopeId,
      requesterId: auth.user.id,
      mode,
    })

    if (result.blocked) {
      const failed = await completeAssistantJob(job.id, {
        status: 'failed',
        errorAr: result.blocked.messageAr,
        resultText: '',
        usedTools: [],
        pendingApprovalIds: [],
      })
      return NextResponse.json({
        ok: false,
        blocked: result.blocked,
        job: failed,
        maxParallel,
        hintAr: assistantParallelHintAr(maxParallel),
      })
    }

    const done = await completeAssistantJob(job.id, {
      status: 'done',
      resultText: result.text,
      usedTools: result.usedTools || [],
      pendingApprovalIds: result.pendingApprovalIds || [],
    })

    if (result.pendingApprovalIds.length > 0) {
      // Client listens for ab-approvals-changed
    }

    return NextResponse.json({
      ok: true,
      job: done,
      hasPendingApprovals: (result.pendingApprovalIds || []).length > 0,
      maxParallel,
      hintAr: assistantParallelHintAr(maxParallel),
    })
  } catch (e) {
    console.error('[assistants/queue/process]', e)
    const failed = await completeAssistantJob(job.id, {
      status: 'failed',
      errorAr:
        e instanceof Error ? e.message : 'تعذّر تشغيل المساعد حالياً',
    })
    return NextResponse.json(
      {
        ok: false,
        error:
          e instanceof Error ? e.message : 'تعذّر تشغيل المساعد حالياً',
        job: failed,
        maxParallel,
      },
      { status: 500 }
    )
  }
}
