import {
  AutonomyTier,
  getToolTrustMetrics,
  isPermanentlyGated,
} from '@/lib/security/trust'

export async function resolveToolAutonomy(
  toolName: string,
  scopeId: string
): Promise<AutonomyTier> {
  if (isPermanentlyGated(toolName)) {
    return 'IN_LOOP'
  }
  const m = await getToolTrustMetrics(toolName, scopeId)
  if (
    m.consecutiveSuccesses >= 20 &&
    m.errorRate < 0.02 &&
    m.userRejections === 0
  ) {
    return 'ON_LOOP'
  }
  return 'IN_LOOP'
}
