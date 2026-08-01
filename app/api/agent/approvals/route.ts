import { requireUser } from '@/lib/auth/session'
import { getUiNotifications } from '@/lib/notifications/emit'
import { listPendingApprovals } from '@/lib/agents/resolve-approval'

export const dynamic = 'force-dynamic'

/**
 * List pending HITL approvals (DB/memory store + UI notification inbox).
 */
export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const stored = await listPendingApprovals()
  const seen = new Set(stored.map((a) => a.approvalId))

  const fromInbox = getUiNotifications()
    .filter(
      (n): n is {
        approvalId: string
        actionName: string
        params: Record<string, unknown>
        riskLevel: 'LOW' | 'HIGH'
        messageAr: string
      } => 'approvalId' in n && Boolean(n.approvalId)
    )
    .filter((n) => !seen.has(n.approvalId))
    .map((n) => ({
      kind: 'approval' as const,
      id: n.approvalId,
      approvalId: n.approvalId,
      actionName: n.actionName,
      params: n.params,
      riskLevel: n.riskLevel,
      status: 'PENDING_APPROVAL' as const,
      messageAr: n.messageAr,
    }))

  const approvals = [
    ...stored.map((a) => ({ kind: 'approval' as const, ...a })),
    ...fromInbox,
  ]

  return Response.json({
    ok: true,
    approvals,
    count: approvals.length,
  })
}
