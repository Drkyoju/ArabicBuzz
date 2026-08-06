/**
 * Prefer a Supabase/PgBouncer pooler URL on serverless (Netlify).
 * Mutates DATABASE_URL in-process before PrismaClient is constructed.
 *
 * Direct host `db.<ref>.supabase.co:5432` often fails DNS from some networks
 * and is a poor fit for serverless. Rewrite to transaction pooler :6543 when
 * SUPABASE_POOLER_REGION is set (or default eu-central-1).
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
    let u = new URL(raw)
    u = maybeRewriteSupabaseDirectToPooler(u)

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

/**
 * postgresql://postgres:PASS@db.REF.supabase.co:5432/postgres
 * → postgresql://postgres.REF:PASS@aws-0-REGION.pooler.supabase.com:6543/postgres
 */
function maybeRewriteSupabaseDirectToPooler(u: URL): URL {
  const m = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(u.hostname)
  if (!m) return u
  if (u.port && u.port !== '5432' && u.port !== '') return u

  const projectRef = m[1]
  const region =
    process.env.SUPABASE_POOLER_REGION?.trim() ||
    process.env.SUPABASE_REGION?.trim() ||
    'eu-central-1'

  const next = new URL(u.toString())
  next.hostname = `aws-0-${region}.pooler.supabase.com`
  next.port = '6543'
  // Pooler login is postgres.<projectRef>
  const user = decodeURIComponent(next.username || 'postgres')
  if (user === 'postgres' || !user.includes('.')) {
    next.username = `postgres.${projectRef}`
  }
  next.searchParams.set('pgbouncer', 'true')
  if (!next.searchParams.has('connection_limit')) {
    next.searchParams.set('connection_limit', '1')
  }
  if (!next.searchParams.has('sslmode')) {
    next.searchParams.set('sslmode', 'require')
  }
  return next
}
