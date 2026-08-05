import { isZoomCreateConfigured } from '@/lib/zoom/create-meeting'
import { isAuthRequired } from '@/lib/auth/session'
import { hasTelegramOwnerTarget } from '@/lib/channels/bindings'
import { connectEnvMcpServers } from '@/lib/mcp/host-client'
import { getMCPHostManager } from '@/lib/mcp/client-manager'
import { MCP_CATALOG } from '@/lib/mcp/catalog'

export const dynamic = 'force-dynamic'

/** Public-ish status of optional integrations (no secrets). */
export async function GET() {
  const telegramOwnerConfigured = await hasTelegramOwnerTarget()
  let mcpServers = 0
  let mcpTools = 0
  try {
    await connectEnvMcpServers()
    const list = getMCPHostManager().listServers()
    mcpServers = list.length
    mcpTools = list.reduce((n, s) => n + s.tools.length, 0)
  } catch {
    /* ignore */
  }
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
    telegramOutboundReady: Boolean(
      process.env.TELEGRAM_BOT_TOKEN?.trim() &&
        (telegramOwnerConfigured ||
          Boolean(process.env.TELEGRAM_TEST_CHAT_ID?.trim()))
    ),
    whatsappOutboundReady: Boolean(
      process.env.WHATSAPP_TOKEN?.trim() &&
        process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() &&
        (process.env.WHATSAPP_OWNER_TO?.trim() ||
          process.env.WHATSAPP_TEST_TO?.trim())
    ),
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
    tokenrouterConfigured: Boolean(process.env.TOKENROUTER_API_KEY?.trim()),
    /** Host is api.tokenrouter.com; left unavailable until a key with quota succeeds. */
    tokenrouterAvailable: false,
    tokenrouterStatusAr:
      'متوقف: api.tokenrouter.com يردّ 401 (رصيد منتهٍ أو مفتاح غير صالح) — لا تُوجَّه النماذج إليه',
    // Drives whether the UI offers the «دخول تجريبي» button at all.
    demoLoginEnabled: process.env.ALLOW_DEMO_LOGIN === 'true',
    driveBrainOwnerConfigured: Boolean(
      process.env.BRAIN_OWNER_USER_ID?.trim() ||
        process.env.DRIVE_BRAIN_OWNER_USER_ID?.trim()
    ),
    mcpCatalogCount: MCP_CATALOG.length,
    mcpConnectedServers: mcpServers,
    mcpConnectedTools: mcpTools,
  })
}
