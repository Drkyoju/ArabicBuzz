import { ensurePooledDatabaseUrl } from '@/lib/db-url'
import { getActiveEmbeddingProvider } from '@/lib/rag/embeddings'
import { getSupabaseAdmin } from '@/lib/supabase/server'

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

  return Response.json({
    ok: freeReady && (prismaOk || supabaseOk),
    freeReady,
    embeddingProvider,
    geminiKeyPresent: Boolean(
      process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()
    ),
    hfTokenPresent: Boolean(process.env.HF_TOKEN?.trim()),
    dbHost,
    dbPooler,
    supabaseOk,
    brainDocuments,
    prismaOk,
    supabaseError,
    prismaError,
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    webSearchFreePath: true,
    webCrawlFreePath: true,
    hitlDisabled:
      process.env.HITL_DISABLED === undefined ||
      process.env.HITL_DISABLED === '' ||
      process.env.HITL_DISABLED === '1' ||
      process.env.HITL_DISABLED?.toLowerCase() === 'true',
  })
}
