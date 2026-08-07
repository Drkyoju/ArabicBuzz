import { requireSessionUser } from '@/lib/auth/session'
import {
  cuaBridgeConfigured,
  cuaHealth,
  cuaStatusAr,
} from '@/lib/tools/cua-bridge'

export const dynamic = 'force-dynamic'

/** Cua Driver bridge health for settings / حالة الربط (owner UI). */
export async function GET(req: Request) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const configured = cuaBridgeConfigured()
  if (!configured) {
    return Response.json({
      configured: false,
      online: false,
      statusAr: cuaStatusAr(false, false),
      installUrl: 'https://cua.ai/cua-driver',
      installScriptMac:
        '/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"',
      installScriptWin: 'irm https://cua.ai/driver/install.ps1 | iex',
      docsUrl: 'https://github.com/trycua/cua',
      messageAr:
        'ثبّت Cua على جهازك ثم اربط العنوان هنا — لا يعمل داخل Netlify مباشرة.',
    })
  }

  const health = await cuaHealth()
  return Response.json({
    configured: true,
    online: health.online,
    statusAr: cuaStatusAr(health.online, true),
    driver: health.driver || null,
    error: health.error || null,
    installUrl: 'https://cua.ai/cua-driver',
    docsUrl: 'https://github.com/trycua/cua',
    envHint: {
      CUA_BRIDGE_URL: 'نفق إلى npm run cua:bridge (منفذ 7430)',
      CUA_BRIDGE_SECRET: 'نفس سر الجسر المحلي (أو MAC_SYNC_SECRET)',
    },
    messageAr: health.messageAr,
  })
}
