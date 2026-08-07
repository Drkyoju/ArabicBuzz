import { isZoomCreateConfigured } from '@/lib/zoom/create-meeting'
import { isAuthRequired } from '@/lib/auth/session'
import { hasTelegramOwnerTarget } from '@/lib/channels/bindings'
import { connectEnvMcpServers } from '@/lib/mcp/host-client'
import { getMCPHostManager } from '@/lib/mcp/client-manager'
import { MCP_CATALOG } from '@/lib/mcp/catalog'
import { isLangfuseConfigured } from '@/lib/observability/langfuse'
import { isBrowserRpaConfigured } from '@/lib/tools/browser-rpa'
import {
  cuaBridgeConfigured,
  cuaHealth,
  cuaStatusAr,
} from '@/lib/tools/cua-bridge'
import { getActiveEmbeddingProvider } from '@/lib/rag/embeddings'
import { ensurePooledDatabaseUrl } from '@/lib/db-url'
import {
  resolveWhatsAppTransport,
  whatsappTransportStatusAr,
} from '@/lib/whatsapp/bridge'
import { buildArabicQualitySignal } from '@/lib/evals/arabic-quality-signal'
import { isHitlDisabled } from '@/lib/security/posture'
import {
  cloudConvertConfigured,
  cloudConvertStatusAr,
} from '@/lib/documents/cloudconvert'
import { googleDriveConvertStatusAr } from '@/lib/documents/google-drive-convert'

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

  let cuaOnline = false
  let cuaMessageAr =
    'ثبّت Cua على جهازك ثم اربط العنوان هنا — لا يعمل داخل Netlify مباشرة.'
  const cuaConfigured = cuaBridgeConfigured()
  if (cuaConfigured) {
    try {
      const h = await cuaHealth()
      cuaOnline = h.online
      cuaMessageAr = h.messageAr
    } catch {
      cuaOnline = false
      cuaMessageAr =
        'جسر Cua مضبوط لكنه غير متصل. شغّل cua-driver serve ثم npm run cua:bridge.'
    }
  }

  // TokenRouter / Kimi retired from product UI (quota-dead); fields kept for API stability.
  const tokenrouterConfigured = false
  const tokenrouterAvailable = false
  const tokenrouterStatusAr = 'مُزال — Kimi/TokenRouter لم يعد في الكتالوج'

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
    cuaBridgeConfigured: cuaConfigured,
    cuaBridgeOnline: cuaOnline,
    cuaStatusAr: cuaStatusAr(cuaOnline, cuaConfigured),
    cuaMessageAr,
    brainPrimaryMac:
      (process.env.BRAIN_PRIMARY || '').toLowerCase() === 'mac',
    triggerDispatchConfigured: Boolean(
      process.env.TRIGGER_DEV_WEBHOOK_URL?.trim()
    ),
    otelConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()),
    langfuseConfigured: isLangfuseConfigured(),
    braveConfigured: Boolean(process.env.BRAVE_API_KEY?.trim()),
    firecrawlConfigured: Boolean(process.env.FIRECRAWL_API_KEY?.trim()),
    cloudConvertConfigured: cloudConvertConfigured(),
    cloudConvertStatusAr: cloudConvertStatusAr(),
    /** Hint for UI — actual convert uses the signed-in user's Google token. */
    googleDriveConvertHintAr: googleDriveConvertStatusAr(false),
    googleDriveConvertBestFreeAr:
      'الأفضل مجاناً: اربط Google من الإعدادات — تحويل Drive عالي الجودة دون دفع',
    /** Free built-in paths work without Brave / Firecrawl keys. */
    webSearchFreePath: true,
    webCrawlFreePath: true,
    /** Free Office edit + Google Drive convert when linked; CloudConvert optional paid. */
    officeEditFreePath: true,
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
