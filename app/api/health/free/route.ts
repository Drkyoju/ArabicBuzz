import { ensurePooledDatabaseUrl } from '@/lib/db-url'
import { buildArabicQualitySignal } from '@/lib/evals/arabic-quality-signal'
import { getActiveEmbeddingProvider } from '@/lib/rag/embeddings'
import { isHitlDisabled } from '@/lib/security/posture'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import {
  resolveWhatsAppTransport,
  whatsappTransportStatusAr,
} from '@/lib/whatsapp/bridge'

export const dynamic = 'force-dynamic'

/**
 * Free-stack health (no secrets). Used to confirm Netlify ↔ Supabase ↔ embeds.
 */
export async function GET() {
  ensurePooledDatabaseUrl()

  const embeddingProvider = getActiveEmbeddingProvider()
  const databaseUrl = process.env.DATABASE_URL || ''
  let dbHost = ''
  let dbPooler = false
  try {
    const u = new URL(databaseUrl)
    dbHost = u.hostname
    dbPooler =
      u.port === '6543' ||
      u.hostname.includes('pooler') ||
      u.searchParams.get('pgbouncer') === 'true'
  } catch {
    /* ignore */
  }

  let supabaseOk = false
  let brainDocuments: number | null = null
  let supabaseError: string | null = null
  try {
    const sb = getSupabaseAdmin()
    if (sb) {
      const { count, error } = await sb
        .from('knowledge_documents')
        .select('id', { count: 'exact', head: true })
      if (error) {
        supabaseError = error.message.slice(0, 160)
      } else {
        supabaseOk = true
        brainDocuments = count ?? 0
      }
    } else {
      supabaseError = 'service role client unavailable'
    }
  } catch (e) {
    supabaseError =
      e instanceof Error ? e.message.slice(0, 160) : 'supabase error'
  }

  let prismaOk = false
  let prismaError: string | null = null
  try {
    const { prisma } = await import('@/lib/db')
    await prisma.$queryRaw`SELECT 1`
    prismaOk = true
  } catch (e) {
    prismaError =
      e instanceof Error ? e.message.slice(0, 160) : 'prisma error'
  }

  const freeReady =
    supabaseOk &&
    (embeddingProvider === 'gemini' ||
      embeddingProvider === 'hf-e5' ||
      embeddingProvider === 'bge-m3' ||
      embeddingProvider === 'hash')

  const willowConfigured = Boolean(
    process.env.WILLOW_STT_URL?.trim() ||
      process.env.WIS_URL?.trim() ||
      process.env.WILLOW_INFERENCE_URL?.trim()
  )
  const hfTokenPresent = Boolean(process.env.HF_TOKEN?.trim())
  const groqKeyPresent = Boolean(process.env.GROQ_API_KEY?.trim())
  const geminiKeyPresent = Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()
  )
  // Mic STT: race Groq/Gemini/Willow/Deepgram → HF → OpenAI (edit-before-send)
  const sttPrimaryReady = willowConfigured || geminiKeyPresent
  const sttBackupReady = hfTokenPresent || groqKeyPresent

  let libreOfficeOk = false
  let libreOfficeStatusAr = 'غير مفحوص'
  try {
    const lo = await import('@/lib/documents/libreoffice-convert')
    libreOfficeOk = await lo.libreOfficeAvailable()
    libreOfficeStatusAr = await lo.libreOfficeStatusAr()
  } catch {
    libreOfficeStatusAr = 'تعذّر فحص LibreOffice'
  }

  return Response.json({
    ok: freeReady && (prismaOk || supabaseOk),
    freeReady,
    embeddingProvider,
    geminiKeyPresent,
    hfTokenPresent,
    groqKeyPresent,
    willowConfigured,
    sttPrimaryReady,
    sttBackupReady,
    sttCascadeAr:
      'سباق سريع: Groq/Gemini/Willow/Deepgram → Hugging Face → OpenAI — الميكروفون يملأ المربع دون إرسال تلقائي',
    dbHost,
    dbPooler,
    supabaseOk,
    brainDocuments,
    prismaOk,
    supabaseError,
    prismaError,
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    telegramLocalBotApiConfigured: Boolean(
      (
        process.env.TELEGRAM_BOT_API_URL ||
        process.env.TELEGRAM_BOT_API_ROOT ||
        ''
      ).trim()
    ),
    telegramLargeFileMacHop: Boolean(
      (process.env.MAC_SYNC_URL || '').trim()
    ),
    telegramLargeFilePathAr:
      'ملف كبير مجاني: Bot API محلي → جسر الماك → سحابة (~20م.ب) → خزنة/Drive ثم إكمال المهمة',
    webSearchFreePath: true,
    webCrawlFreePath: true,
    officeConvertFreePath: true,
    libreOfficeOk,
    libreOfficeStatusAr,
    libreOfficeImageFlag: process.env.AB_LIBREOFFICE_IMAGE || '0',
    paddleOcrConfigured: Boolean(
      process.env.PADDLE_OCR_URL?.trim() ||
        process.env.ENABLE_PADDLE_OCR?.trim() === '1'
    ),
    mistralOcrConfigured:
      process.env.CONVERT_ALLOW_MISTRAL?.trim() === '1' &&
      Boolean(process.env.MISTRAL_API_KEY?.trim()),
    convertAllowMistral:
      process.env.CONVERT_ALLOW_MISTRAL?.trim() === '1',
    ocrConvertCascadeAr:
      'Gemini Flash → Gemini أقوى → PaddleOCR → توقّف (Mistral فقط مع CONVERT_ALLOW_MISTRAL=1 + مفتاح؛ افتراضي OFF) → رفض بلا طلاسم',
    googleDriveConvertHintAr:
      'مجاني مع حساب Google مربوط (drive.file) — الأفضل للعربية والتخطيط',
    cloudConvertOptionalPaid: true,
    hitlDisabled: isHitlDisabled(),
    hitlPostureAr: isHitlDisabled()
      ? 'الموافقات معطّلة — عيّن HITL_DISABLED=0 (موافقة للحذف فقط تحت AUTO)'
      : 'الموافقات مفعّلة — وضع AUTO: موافقة لحذف الملفات والأشياء فقط',
    whatsappTransport: resolveWhatsAppTransport(),
    whatsappStatusAr: whatsappTransportStatusAr().detailAr,
    arabicQuality: buildArabicQualitySignal(),
    cuaBridgeConfigured: Boolean(process.env.CUA_BRIDGE_URL?.trim()),
    cuaStatusAr: process.env.CUA_BRIDGE_URL?.trim()
      ? 'مضبوط · افحص /api/cua/status للاتصال الحي'
      : 'غير متصل — ثبّت Cua على جهازك ثم اربط CUA_BRIDGE_URL',
  })
}
