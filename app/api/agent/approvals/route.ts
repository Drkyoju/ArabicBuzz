import { requireUser } from '@/lib/auth/session'
import { getUiNotifications } from '@/lib/notifications/emit'

export const dynamic = 'force-dynamic'

/**
 * List pending UI approval notifications (in-memory HITL inbox).
 */
export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const items = getUiNotifications()
    .filter(
      (n): n is {
        approvalId: string
        actionName: string
        params: Record<string, unknown>
        riskLevel: 'LOW' | 'HIGH'
        messageAr: string
      } => 'approvalId' in n && Boolean(n.approvalId)
    )
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

  return Response.json({
    ok: true,
    approvals: items,
    count: items.length,
  })
}
