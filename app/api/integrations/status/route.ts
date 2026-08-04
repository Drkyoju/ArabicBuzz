import { isZoomCreateConfigured } from '@/lib/zoom/create-meeting'
import { isAuthRequired } from '@/lib/auth/session'
import { hasTelegramOwnerTarget } from '@/lib/channels/bindings'

export const dynamic = 'force-dynamic'

/** Public-ish status of optional integrations (no secrets). */
export async function GET() {
  const telegramOwnerConfigured = await hasTelegramOwnerTarget()
  return Response.json({
    zoomConfigured: isZoomCreateConfigured(),
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    telegramOwnerConfigured,
    channelOwnerConfigured: Boolean(
      process.env.CHANNEL_OWNER_USER_ID?.trim() ||
        process.env.TELEGRAM_OWNER_USER_ID?.trim()
    ),
    whatsappConfigured: Boolean(
      process.env.WHATSAPP_TOKEN?.trim() &&
        process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
    ),
    whatsappOwnerConfigured: Boolean(process.env.WHATSAPP_OWNER_TO?.trim()),
    macSyncConfigured: Boolean(process.env.MAC_SYNC_URL?.trim()),
    brainPrimaryMac:
      (process.env.BRAIN_PRIMARY || '').toLowerCase() === 'mac',
    triggerDispatchConfigured: Boolean(
      process.env.TRIGGER_DEV_WEBHOOK_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim()
    ),
    otelConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()),
    upstashConfigured: Boolean(
      process.env.UPSTASH_REDIS_REST_URL?.trim() &&
        process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
    ),
    authRequired: isAuthRequired(),
  })
}
