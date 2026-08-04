import { isZoomCreateConfigured } from '@/lib/zoom/create-meeting'
import { isAuthRequired } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/** Public-ish status of optional integrations (no secrets). */
export async function GET() {
  return Response.json({
    zoomConfigured: isZoomCreateConfigured(),
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    telegramOwnerConfigured: Boolean(process.env.TELEGRAM_OWNER_CHAT_ID?.trim()),
    whatsappConfigured: Boolean(
      process.env.WHATSAPP_TOKEN?.trim() &&
        process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
    ),
    whatsappOwnerConfigured: Boolean(process.env.WHATSAPP_OWNER_TO?.trim()),
    macSyncConfigured: Boolean(process.env.MAC_SYNC_URL?.trim()),
    brainPrimaryMac:
      (process.env.BRAIN_PRIMARY || '').toLowerCase() === 'mac',
    authRequired: isAuthRequired(),
  })
}
