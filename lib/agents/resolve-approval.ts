import { prisma, withPrismaFallback } from '@/lib/db'
import { getToolExecutor } from '@/lib/agents/tools'
import { resumeAgentAfterApproval } from '@/lib/agents/loop'
import { recordToolExecution } from '@/lib/security/trust'
import {
  ARABIC_AUTHZ_ERROR,
  assertPermission,
  SENSITIVE_ACTION_ROLES,
  withRlsContext,
} from '@/lib/auth/rbac'
import {
  getPendingApprovalFromSupabase,
  listPendingApprovalsFromSupabase,
  updateApprovalInSupabase,
} from '@/lib/supabase/server'
import { DEFAULT_DIRECTOR_EMAIL } from '@/lib/auth/roles'

export type ResolveApprovalInput = {
  approvalId: string
  decision: 'APPROVE' | 'REJECT'
  modifiedParams?: Record<string, unknown>
  approvedBy?: string
  userId?: string
  orgId?: string
  email?: string | null
}

const memoryApprovals = new Map<
  string,
  {
    id: string
    actionName: string
    params: Record<string, unknown>
    status: string
    riskLevel: string
    requesterId: string
    threadId?: string
    scopeId?: string
    toolOutput?: unknown
    modifiedParams?: Record<string, unknown>
  }
>()

export function seedMemoryApproval(row: {
  id: string
  actionName: string
  params: Record<string, unknown>
  riskLevel: string
  requesterId: string
  threadId?: string
  scopeId?: string
}) {
  memoryApprovals.set(row.id, { ...row, status: 'PENDING_APPROVAL' })
}

/** Pending HITL rows for the approvals inbox (memory + optional DB). */
export async function listPendingApprovals(): Promise<
  Array<{
    id: string
    approvalId: string
    actionName: string
    params: Record<string, unknown>
    riskLevel: 'LOW' | 'HIGH'
    status: 'PENDING_APPROVAL'
    messageAr: string
    scopeId?: string
  }>
> {
  const fromMem = [...memoryApprovals.values()]
    .filter((r) => r.status === 'PENDING_APPROVAL')
    .map((r) => ({
      id: r.id,
      approvalId: r.id,
      actionName: r.actionName,
      params: r.params,
      riskLevel: (r.riskLevel === 'HIGH' ? 'HIGH' : 'LOW') as 'LOW' | 'HIGH',
      status: 'PENDING_APPROVAL' as const,
      messageAr: `إجراء يحتاج موافقة: ${r.actionName}`,
      scopeId: r.scopeId,
    }))

  const fromDb = await withPrismaFallback(async () => {
    const rows = await prisma.pendingApproval.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return rows.map((r) => ({
      id: r.id,
      approvalId: r.id,
      actionName: r.actionName,
      params: r.params as Record<string, unknown>,
      riskLevel: (r.riskLevel === 'HIGH' ? 'HIGH' : 'LOW') as 'LOW' | 'HIGH',
      status: 'PENDING_APPROVAL' as const,
      messageAr: `إجراء يحتاج موافقة: ${r.actionName}`,
      scopeId: r.scopeId || undefined,
    }))
  }, [] as typeof fromMem)

  const fromSb = (await listPendingApprovalsFromSupabase(50)).map((r) => ({
    id: r.id,
    approvalId: r.id,
    actionName: r.action_name,
    params: (r.params || {}) as Record<string, unknown>,
    riskLevel: (r.risk_level === 'HIGH' ? 'HIGH' : 'LOW') as 'LOW' | 'HIGH',
    status: 'PENDING_APPROVAL' as const,
    messageAr: `إجراء يحتاج موافقة: ${r.action_name}`,
    scopeId: r.scope_id || undefined,
  }))

  const seen = new Set<string>()
  const merged: typeof fromMem = []
  for (const row of [...fromSb, ...fromDb, ...fromMem]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    merged.push(row)
  }
  return merged
}

export async function resolveApproval(input: ResolveApprovalInput) {
  const dbRow = await withPrismaFallback(async () => {
    return prisma.pendingApproval.findUnique({ where: { id: input.approvalId } })
  }, null)
  const memRow = memoryApprovals.get(input.approvalId)
  const sbRow = !dbRow && !memRow
    ? await getPendingApprovalFromSupabase(input.approvalId)
    : null
  const row = dbRow
    ? {
        id: dbRow.id,
        actionName: dbRow.actionName,
        params: dbRow.params as Record<string, unknown>,
        status: dbRow.status,
        riskLevel: dbRow.riskLevel,
        requesterId: dbRow.requesterId,
        threadId: dbRow.threadId || undefined,
        scopeId: dbRow.scopeId || undefined,
      }
    : memRow
      ? memRow
      : sbRow
        ? {
            id: sbRow.id,
            actionName: sbRow.action_name,
            params: (sbRow.params || {}) as Record<string, unknown>,
            status: sbRow.status,
            riskLevel: sbRow.risk_level,
            requesterId: sbRow.requester_id,
            threadId: sbRow.thread_id || undefined,
            scopeId: sbRow.scope_id || undefined,
          }
        : null

  if (!row) {
    throw new Error('NOT_FOUND')
  }
  if (row.status !== 'PENDING_APPROVAL') {
    throw new Error('ALREADY_RESOLVED')
  }

  const isHighRisk = row.riskLevel === 'HIGH'
  if (isHighRisk) {
    const userId = input.userId || input.approvedBy || ''
    const orgId =
      input.orgId?.trim() || process.env.DEFAULT_ORG_ID || 'org-demo'
    if (!userId) {
      throw new Error('MISSING_TENANT_CONTEXT')
    }
    const email =
      input.email?.trim() ||
      process.env.TELEGRAM_APPROVER_EMAIL?.trim() ||
      DEFAULT_DIRECTOR_EMAIL
    await assertPermission(
      userId,
      orgId,
      SENSITIVE_ACTION_ROLES.approveHighRisk,
      email
    )
  }

  const run = async () => {
    const baseParams =
      typeof row.params === 'object' && row.params
        ? (row.params as Record<string, unknown>)
        : {}
    const finalParams = { ...baseParams, ...(input.modifiedParams || {}) }

    if (input.decision === 'REJECT') {
      await withPrismaFallback(
        () =>
          prisma.pendingApproval.update({
            where: { id: input.approvalId },
            data: { status: 'REJECTED' },
          }),
        null
      )
      await updateApprovalInSupabase({
        approvalId: input.approvalId,
        status: 'REJECTED',
        resolvedBy: input.approvedBy,
        actionName: row.actionName,
        params: baseParams,
        riskLevel: row.riskLevel === 'HIGH' ? 'HIGH' : 'LOW',
        requesterId: row.requesterId,
      })
      const mem = memoryApprovals.get(input.approvalId)
      if (mem) mem.status = 'REJECTED'
      await recordToolExecution(
        row.actionName,
        row.scopeId || 'shared-demo',
        'REJECTED'
      )
      const resumed = resumeAgentAfterApproval({
        threadId: row.threadId || undefined,
        approvalId: input.approvalId,
        rejectionMessage: 'تم رفض هذا الإجراء من قبل المستخدم',
      })
      return { status: 'REJECTED' as const, resumed: resumed.resumed }
    }

    try {
      const execute = getToolExecutor(row.actionName)
      const toolOutput = await execute(row.actionName, finalParams)
      await withPrismaFallback(
        () =>
          prisma.pendingApproval.update({
            where: { id: input.approvalId },
            data: {
              status: 'APPROVED',
              toolOutput: toolOutput as object,
              modifiedParams: input.modifiedParams as object | undefined,
            },
          }),
        null
      )
      await updateApprovalInSupabase({
        approvalId: input.approvalId,
        status: 'APPROVED',
        resolvedBy: input.approvedBy,
        decisionNoteAr: 'تمت الموافقة والتنفيذ',
        actionName: row.actionName,
        params: finalParams,
        riskLevel: row.riskLevel === 'HIGH' ? 'HIGH' : 'LOW',
        requesterId: row.requesterId,
      })
      const mem = memoryApprovals.get(input.approvalId)
      if (mem) {
        mem.status = 'APPROVED'
        mem.toolOutput = toolOutput
        mem.modifiedParams = input.modifiedParams
      }
      await recordToolExecution(
        row.actionName,
        row.scopeId || 'shared-demo',
        'APPROVED'
      )
      const resumed = resumeAgentAfterApproval({
        threadId: row.threadId || undefined,
        approvalId: input.approvalId,
        toolOutput,
      })
      return {
        status: 'APPROVED' as const,
        resumed: resumed.resumed,
        toolOutput,
      }
    } catch (e) {
      await recordToolExecution(
        row.actionName,
        row.scopeId || 'shared-demo',
        'ERROR'
      )
      throw e
    }
  }

  const rlsOrgId =
    input.orgId?.trim() || process.env.DEFAULT_ORG_ID || 'org-demo'
  if (input.userId) {
    return withRlsContext({ userId: input.userId, orgId: rlsOrgId }, run)
  }
  return run()
}

export { ARABIC_AUTHZ_ERROR }
