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
  getAssistantMaxPerUser,
} from '@/lib/assistants/parallel'
import { parsePosture } from '@/lib/security/posture'
import { parseRunEffort } from '@/lib/ai/run-effort'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function limitsPayload() {
  const maxParallel = getAssistantMaxParallel()
  const maxPerUser = getAssistantMaxPerUser()
  return {
    maxParallel,
    maxPerUser,
    hintAr: assistantParallelHintAr(maxPerUser),
  }
}

/**
 * POST { jobId?, scopeId?, modelSlug?, effortLevel? } — claim + run.
 * Client keeps up to per-user / scope caps in flight.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  let body: {
    jobId?: string
    scopeId?: string
    securityPosture?: string
    modelSlug?: string
    effortLevel?: string
    effort?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 })
  }

  const scopeId = String(body.scopeId || 'shared-demo').trim() || 'shared-demo'
  const limits = limitsPayload()
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
        ...limits,
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
          ...limits,
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
      ...limits,
    })
  }

  const job = claimed.job
  const mode = parsePosture(
    body.securityPosture || process.env.DEFAULT_SECURITY_POSTURE
  )
  const modelSlug =
    (body.modelSlug ? String(body.modelSlug).trim() : '') ||
    job.modelSlug ||
    undefined
  const effortLevel = parseRunEffort(
    body.effortLevel || body.effort || job.effortLevel
  )

  try {
    const result = await runAssistant({
      assistantId: job.assistantId,
      message: job.message,
      scopeId,
      requesterId: auth.user.id,
      mode,
      modelSlug,
      effortLevel,
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
        ...limits,
      })
    }

    const done = await completeAssistantJob(job.id, {
      status: 'done',
      resultText: result.text,
      usedTools: result.usedTools || [],
      pendingApprovalIds: result.pendingApprovalIds || [],
    })

    return NextResponse.json({
      ok: true,
      job: done,
      hasPendingApprovals: (result.pendingApprovalIds || []).length > 0,
      ...limits,
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
        ...limits,
      },
      { status: 500 }
    )
  }
}
