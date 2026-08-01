import { prisma, withPrismaFallback } from '@/lib/db'

export interface ToolTrustMetrics {
  toolName: string
  scopeId: string
  totalExecutions: number
  userApprovals: number
  userRejections: number
  consecutiveSuccesses: number
  errorRate: number
  lastExecutedAt: string
}

export type AutonomyTier = 'IN_LOOP' | 'ON_LOOP' | 'PERMANENTLY_GATED'

export const PERMANENTLY_GATED_TOOLS = [
  'delete_database',
  'transfer_funds',
  'change_user_roles',
] as const

export function isPermanentlyGated(toolName: string): boolean {
  return (PERMANENTLY_GATED_TOOLS as readonly string[]).includes(toolName)
}

const memoryStore = new Map<string, ToolTrustMetrics>()

function key(toolName: string, scopeId: string) {
  return `${scopeId}::${toolName}`
}

function emptyMetrics(toolName: string, scopeId: string): ToolTrustMetrics {
  return {
    toolName,
    scopeId,
    totalExecutions: 0,
    userApprovals: 0,
    userRejections: 0,
    consecutiveSuccesses: 0,
    errorRate: 0,
    lastExecutedAt: new Date(0).toISOString(),
  }
}

export async function getToolTrustMetrics(
  toolName: string,
  scopeId: string
): Promise<ToolTrustMetrics> {
  const k = key(toolName, scopeId)
  return withPrismaFallback(async () => {
    const row = await prisma.toolTrustMetric.findUnique({
      where: { toolName_scopeId: { toolName, scopeId } },
    })
    if (!row) return memoryStore.get(k) ?? emptyMetrics(toolName, scopeId)
    const total = row.totalExecutions || 1
    return {
      toolName: row.toolName,
      scopeId: row.scopeId,
      totalExecutions: row.totalExecutions,
      userApprovals: row.userApprovals,
      userRejections: row.userRejections,
      consecutiveSuccesses: row.consecutiveSuccesses,
      errorRate: row.errorCount / total,
      lastExecutedAt: (row.lastExecutedAt ?? new Date()).toISOString(),
    }
  }, memoryStore.get(k) ?? emptyMetrics(toolName, scopeId))
}

export async function recordToolExecution(
  toolName: string,
  scopeId: string,
  result: 'APPROVED' | 'REJECTED' | 'ERROR'
): Promise<void> {
  const current = await getToolTrustMetrics(toolName, scopeId)
  const next: ToolTrustMetrics = { ...current }
  next.totalExecutions += 1
  next.lastExecutedAt = new Date().toISOString()
  if (result === 'APPROVED') {
    next.userApprovals += 1
    next.consecutiveSuccesses += 1
  } else if (result === 'REJECTED') {
    next.userRejections += 1
    next.consecutiveSuccesses = 0
  } else {
    next.consecutiveSuccesses = 0
    const errors = Math.round(current.errorRate * current.totalExecutions) + 1
    next.errorRate = errors / next.totalExecutions
  }
  if (result !== 'ERROR') {
    const errors = Math.round(current.errorRate * current.totalExecutions)
    next.errorRate = errors / next.totalExecutions
  }
  memoryStore.set(key(toolName, scopeId), next)

  await withPrismaFallback(async () => {
    const errorInc = result === 'ERROR' ? 1 : 0
    await prisma.toolTrustMetric.upsert({
      where: { toolName_scopeId: { toolName, scopeId } },
      create: {
        toolName,
        scopeId,
        totalExecutions: 1,
        userApprovals: result === 'APPROVED' ? 1 : 0,
        userRejections: result === 'REJECTED' ? 1 : 0,
        consecutiveSuccesses: result === 'APPROVED' ? 1 : 0,
        errorCount: errorInc,
        lastExecutedAt: new Date(),
      },
      update: {
        totalExecutions: { increment: 1 },
        userApprovals: result === 'APPROVED' ? { increment: 1 } : undefined,
        userRejections: result === 'REJECTED' ? { increment: 1 } : undefined,
        consecutiveSuccesses:
          result === 'APPROVED' ? { increment: 1 } : { set: 0 },
        errorCount: result === 'ERROR' ? { increment: 1 } : undefined,
        lastExecutedAt: new Date(),
      },
    })
    return null
  }, null)
}
