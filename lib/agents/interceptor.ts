import { randomUUID } from 'crypto'
import { evaluateActionRisk, SecurityPostureMode } from '@/lib/security/posture'
import { resolveToolAutonomy } from '@/lib/agents/trust-evaluator'
import { recordToolExecution } from '@/lib/security/trust'
import { prisma, withPrismaFallback } from '@/lib/db'
import {
  emitApprovalNotification,
  emitPassiveNotification,
  ApprovalNotificationPayload,
} from '@/lib/notifications/emit'
import { seedMemoryApproval } from '@/lib/agents/resolve-approval'
import type { ToolExecutor } from '@/lib/agents/tools'
import { markThreadPaused } from '@/lib/agents/loop'

export type InterceptResult =
  | { status: 'executed'; output: unknown; passiveNoticeAr?: string }
  | {
      status: 'paused'
      approvalId: string
      notification: ApprovalNotificationPayload
    }

export async function interceptToolExecution(opts: {
  toolName: string
  params: Record<string, unknown>
  mode: SecurityPostureMode
  requesterId: string
  threadId?: string
  scopeId?: string
  execute: ToolExecutor
}): Promise<InterceptResult> {
  const scopeId = opts.scopeId || 'shared-demo'
  const risk = evaluateActionRisk(opts.toolName, opts.params, opts.mode)
  const autonomy = await resolveToolAutonomy(opts.toolName, scopeId)

  const needsHuman = risk.requiresApproval
  const onLoopAllowed = autonomy === 'ON_LOOP' && opts.mode === 'AUTO'

  if (needsHuman && !onLoopAllowed) {
    const approvalId = randomUUID()
    const notification: ApprovalNotificationPayload = {
      approvalId,
      actionName: opts.toolName,
      params: opts.params,
      riskLevel: risk.riskLevel,
      messageAr: `إجراء يحتاج موافقة: ${opts.toolName}`,
    }

    await withPrismaFallback(
      () =>
        prisma.pendingApproval.create({
          data: {
            id: approvalId,
            actionName: opts.toolName,
            params: opts.params as object,
            riskLevel: risk.riskLevel,
            status: 'PENDING_APPROVAL',
            requesterId: opts.requesterId,
            threadId: opts.threadId,
            scopeId,
          },
        }),
      null
    )
    seedMemoryApproval({
      id: approvalId,
      actionName: opts.toolName,
      params: opts.params,
      riskLevel: risk.riskLevel,
      requesterId: opts.requesterId,
      threadId: opts.threadId,
      scopeId,
    })
    if (opts.threadId) {
      markThreadPaused(opts.threadId, [])
    }
    await emitApprovalNotification(notification)
    return { status: 'paused', approvalId, notification }
  }

  try {
    const output = await opts.execute(opts.toolName, opts.params)
    let passiveNoticeAr: string | undefined
    if (onLoopAllowed && risk.requiresApproval) {
      await recordToolExecution(opts.toolName, scopeId, 'APPROVED')
      passiveNoticeAr = `⚡ تم تنفيذ الإجراء الموثوق تلقائياً: ${opts.toolName}`
      await emitPassiveNotification({
        messageAr: passiveNoticeAr,
        actionName: opts.toolName,
      })
    }
    return { status: 'executed', output, passiveNoticeAr }
  } catch (e) {
    if (onLoopAllowed) {
      await recordToolExecution(opts.toolName, scopeId, 'ERROR')
    }
    throw e
  }
}
