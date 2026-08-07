import { ensurePooledDatabaseUrl } from '@/lib/db-url'
import { getSupabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const READY_TIMEOUT_MS = 2000

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Readiness — cheap dependency check (Prisma SELECT 1 and/or Supabase).
 * Prefer this over /api/health/free for deploy probes.
 */
export async function GET() {
  ensurePooledDatabaseUrl()

  const envOk = Boolean(
    process.env.DATABASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  )

  let prismaOk = false
  let prismaError: string | null = null
  try {
    const { prisma } = await import('@/lib/db')
    await withTimeout(prisma.$queryRaw`SELECT 1`, READY_TIMEOUT_MS)
    prismaOk = true
  } catch (e) {
    prismaError =
      e instanceof Error ? e.message.slice(0, 120) : 'prisma error'
  }

  let supabaseOk = false
  let supabaseError: string | null = null
  try {
    const sb = getSupabaseAdmin()
    if (!sb) {
      supabaseError = 'service role unavailable'
    } else {
      const { error } = await withTimeout(
        sb.from('workspace_files').select('id', { count: 'exact', head: true }),
        READY_TIMEOUT_MS
      )
      if (error) supabaseError = error.message.slice(0, 120)
      else supabaseOk = true
    }
  } catch (e) {
    supabaseError =
      e instanceof Error ? e.message.slice(0, 120) : 'supabase error'
  }

  const ready = envOk && (prismaOk || supabaseOk)
  return Response.json(
    {
      ok: ready,
      status: ready ? 'ready' : 'not_ready',
      envOk,
      prismaOk,
      supabaseOk,
      prismaError,
      supabaseError,
      ts: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
