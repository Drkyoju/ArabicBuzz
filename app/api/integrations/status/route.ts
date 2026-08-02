import { isZoomCreateConfigured } from '@/lib/zoom/create-meeting'

export const dynamic = 'force-dynamic'

/** Public-ish status of optional integrations (no secrets). */
export async function GET() {
  return Response.json({
    zoomConfigured: isZoomCreateConfigured(),
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    whatsappConfigured: Boolean(
      process.env.WHATSAPP_TOKEN?.trim() &&
        process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
    ),
    macSyncConfigured: Boolean(process.env.MAC_SYNC_URL?.trim()),
    brainPrimaryMac:
      (process.env.BRAIN_PRIMARY || '').toLowerCase() === 'mac',
  })
}
