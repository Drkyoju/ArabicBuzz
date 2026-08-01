import type { AutonomyTier } from '@/lib/security/trust'

export function TrustBadge({
  tier,
  permanentlyGated,
}: {
  tier: AutonomyTier | 'IN_LOOP' | 'ON_LOOP'
  permanentlyGated?: boolean
}) {
  if (tier === 'ON_LOOP' && !permanentlyGated) {
    return (
      <span className="inline-flex rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-ab-accent border border-ab-accent/20">
        ⚡ إجراء موثوق (التنفيذ التلقائي متاح)
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 border border-red-200">
      🔒 يتطلب إذن مباشر
    </span>
  )
}
