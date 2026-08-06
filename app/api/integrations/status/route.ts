import { isZoomCreateConfigured } from '@/lib/zoom/create-meeting'
import { isAuthRequired } from '@/lib/auth/session'
import { hasTelegramOwnerTarget } from '@/lib/channels/bindings'
import { connectEnvMcpServers } from '@/lib/mcp/host-client'
import { getMCPHostManager } from '@/lib/mcp/client-manager'
import { MCP_CATALOG } from '@/lib/mcp/catalog'
import { isLangfuseConfigured } from '@/lib/observability/langfuse'
import { isBrowserRpaConfigured } from '@/lib/tools/browser-rpa'
import { getActiveEmbeddingProvider } from '@/lib/rag/embeddings'
import { ensurePooledDatabaseUrl } from '@/lib/db-url'
import { getProvidersSnapshot } from '@/lib/ai/provider-availability'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'
import {
  resolveWhatsAppTransport,
  whatsappTransportStatusAr,
} from '@/lib/whatsapp/bridge'
import { buildArabicQualitySignal } from '@/lib/evals/arabic-quality-signal'
import { isHitlDisabled } from '@/lib/security/posture'

export const dynamic = 'force-dynamic'

/** Public-ish status of optional integrations (no secrets). */
export async function GET() {
  ensurePooledDatabaseUrl()
  const telegramOwnerConfigured = await hasTelegramOwnerTarget()
  const embeddingProvider = getActiveEmbeddingProvider()
  let dbPooler = false
  try {
    const u = new URL(process.env.DATABASE_URL || '')
    dbPooler =
      u.port === '6543' ||
      u.hostname.includes('pooler') ||
      u.searchParams.get('pgbouncer') === 'true'
  } catch {
    /* ignore */
  }
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

  let tokenrouterConfigured = Boolean(process.env.TOKENROUTER_API_KEY?.trim())
  let tokenrouterAvailable = false
  let tokenrouterStatusAr =
    'لم يُضبط TOKENROUTER_API_KEY بعد — أضفه من مفاتيح API لفتح Kimi Free'
  try {
    const snap = await getProvidersSnapshot(Boolean(IS_AIR_GAPPED_MODE))
    const tr = snap.providers.find((p) => p.envName === 'TOKENROUTER_API_KEY')
    const kimi = snap.models.find((m) => m.slug === 'moonshotai/kimi-k3-free')
    tokenrouterConfigured = Boolean(tr?.configured)
    tokenrouterAvailable = Boolean(kimi?.available)
    if (!tokenrouterConfigured) {
      tokenrouterStatusAr =
        'لم يُضبط TOKENROUTER_API_KEY بعد — أضفه من مفاتيح API لفتح Kimi Free'
    } else if (tokenrouterAvailable) {
      tokenrouterStatusAr = 'مفعّل · Kimi K3 Free جاهز'
    } else {
      tokenrouterStatusAr =
        tr?.liveDetail ||
        kimi?.blockedReasonAr ||
        'المفتاح موجود لكن الرصيد منتهٍ أو مرفوض'
    }
  } catch {
    /* keep defaults */
  }

  return Response.json({
    embeddingProvider,
    embeddingStatusAr:
      embeddingProvider === 'gemini'
        ? 'مجاني · Gemini (مفتاحكم الحالي)'
        : embeddingProvider === 'hf-e5'
          ? 'مجاني · Hugging Face e5'
          : embeddingProvider === 'bge-m3'
            ? 'مجاني · BGE-M3 محلي'
            : embeddingProvider === 'cohere'
              ? 'مدفوع اختياري · Cohere'
              : 'احتياطي مجاني · hash',
    dbPooler,
    zoomConfigured: isZoomCreateConfigured(),
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    telegramOwnerConfigured,
    channelOwnerConfigured: Boolean(
      process.env.CHANNEL_OWNER_USER_ID?.trim() ||
        process.env.TELEGRAM_OWNER_USER_ID?.trim()
    ),
    whatsappConfigured: resolveWhatsAppTransport() !== 'none',
    whatsappTransport: resolveWhatsAppTransport(),
    whatsappStatusAr: whatsappTransportStatusAr().detailAr,
    whatsappBridgeConfigured: resolveWhatsAppTransport() === 'bridge',
    whatsappOwnerConfigured: Boolean(
      process.env.WHATSAPP_OWNER_TO?.trim() ||
        process.env.WHATSAPP_BRIDGE_OWNER_TO?.trim()
    ),
    telegramOutboundReady: Boolean(
      process.env.TELEGRAM_BOT_TOKEN?.trim() &&
        (telegramOwnerConfigured ||
          Boolean(process.env.TELEGRAM_TEST_CHAT_ID?.trim()))
    ),
    whatsappOutboundReady:
      resolveWhatsAppTransport() === 'bridge'
        ? Boolean(
            process.env.WHATSAPP_OWNER_TO?.trim() ||
              process.env.WHATSAPP_BRIDGE_OWNER_TO?.trim() ||
              process.env.WHATSAPP_TEST_TO?.trim()
          )
        : Boolean(
            process.env.WHATSAPP_TOKEN?.trim() &&
              process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() &&
              (process.env.WHATSAPP_OWNER_TO?.trim() ||
                process.env.WHATSAPP_TEST_TO?.trim())
          ),
    hitlDisabled: isHitlDisabled(),
    arabicQuality: buildArabicQualitySignal(),
    macSyncConfigured: Boolean(process.env.MAC_SYNC_URL?.trim()),
    brainPrimaryMac:
      (process.env.BRAIN_PRIMARY || '').toLowerCase() === 'mac',
    triggerDispatchConfigured: Boolean(
      process.env.TRIGGER_DEV_WEBHOOK_URL?.trim()
    ),
    otelConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()),
    langfuseConfigured: isLangfuseConfigured(),
    braveConfigured: Boolean(process.env.BRAVE_API_KEY?.trim()),
    firecrawlConfigured: Boolean(process.env.FIRECRAWL_API_KEY?.trim()),
    /** Free built-in paths work without Brave / Firecrawl keys. */
    webSearchFreePath: true,
    webCrawlFreePath: true,
    /** Director-facing Arabic labels — not red “broken” when free path works. */
    braveStatusAr: process.env.BRAVE_API_KEY?.trim()
      ? 'اختياري بمفتاح · مفعّل'
      : 'مجاني مدمج (DuckDuckGo · ويكيبيديا · gov.sa)',
    firecrawlStatusAr: process.env.FIRECRAWL_API_KEY?.trim()
      ? 'اختياري بمفتاح · مفعّل'
      : 'مجاني مدمج (Jina Reader · جلب مباشر)',
    langfuseStatusAr: isLangfuseConfigured()
      ? 'مفعّل (Langfuse Cloud)'
      : 'يحتاج مفتاح مجاني من cloud.langfuse.com',
    webSearchReady: true,
    webCrawlReady: true,
    mcpToolboxConfigured: Boolean(process.env.MCP_TOOLBOX_URL?.trim()),
    steelConfigured: Boolean(process.env.STEEL_API_KEY?.trim()),
    browserUseConfigured: Boolean(process.env.BROWSER_USE_URL?.trim()),
    browserRpaConfigured: isBrowserRpaConfigured(),
    upstashConfigured: Boolean(
      process.env.UPSTASH_REDIS_REST_URL?.trim() &&
        process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
    ),
    authRequired: isAuthRequired(),
    tokenrouterConfigured,
    tokenrouterAvailable,
    tokenrouterStatusAr,
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
