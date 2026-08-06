/**
 * Prefer a Supabase/PgBouncer pooler URL on serverless (Netlify).
 * Mutates DATABASE_URL in-process before PrismaClient is constructed.
 */
export function ensurePooledDatabaseUrl(): string | undefined {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
  ].filter((v): v is string => Boolean(v && v.trim()))

  const raw = candidates[0]
  if (!raw) return undefined

  try {
    const u = new URL(raw)
    const isPooler =
      u.port === '6543' ||
      u.hostname.includes('pooler') ||
      u.searchParams.get('pgbouncer') === 'true'

    if (isPooler) {
      u.searchParams.set('pgbouncer', 'true')
      if (!u.searchParams.has('connection_limit')) {
        u.searchParams.set('connection_limit', '1')
      }
      // Transaction mode pooler: avoid prepared-statement issues with Prisma
      if (!u.searchParams.has('sslmode') && u.hostname.includes('supabase')) {
        u.searchParams.set('sslmode', 'require')
      }
    }

    const next = u.toString()
    process.env.DATABASE_URL = next
    return next
  } catch {
    process.env.DATABASE_URL = raw
    return raw
  }
}
