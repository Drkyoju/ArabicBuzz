import { requireSessionUser } from '@/lib/auth/session'
import {
  directMacUploadInfo,
  getMacSyncConfig,
  isBrainPrimaryMac,
  macBrainStatus,
  macHealth,
  macSyncConfigured,
} from '@/lib/storage/mac-sync-client'

export const dynamic = 'force-dynamic'

/** Mac agent health + brain status for settings UI. */
export async function GET(req: Request) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const configured = macSyncConfigured()
  const primaryMac = isBrainPrimaryMac()
  const direct = directMacUploadInfo()
  const { publicUploadUrl } = getMacSyncConfig()

  if (!configured) {
    return Response.json({
      configured: false,
      primaryMac,
      online: false,
      directUpload: null,
      messageAr:
        'اضبط MAC_SYNC_URL و MAC_SYNC_SECRET على Netlify، وشغّل npm run storage:sync على الماك مع نفق (ngrok).',
    })
  }

  const health = await macHealth()
  let brain: Record<string, unknown> | null = null
  if (health.ok) {
    try {
      brain = (await macBrainStatus()) as Record<string, unknown>
    } catch {
      brain = (health.brain as Record<string, unknown>) || null
    }
  }

  return Response.json({
    configured: true,
    primaryMac,
    online: health.ok,
    error: health.error || null,
    storage: health.storage || null,
    brain,
    publicUploadUrl: publicUploadUrl || null,
    directUpload: direct,
    messageAr: health.ok
      ? primaryMac
        ? 'وكيل الماك متصل — عقل الشركة والملفات على جهازك.'
        : 'وكيل الماك متصل (BRAIN_PRIMARY ليس mac — البحث السحابي ما زال الافتراضي).'
      : health.error || 'وكيل الماك غير متصل',
  })
}
