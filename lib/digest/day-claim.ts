/**
 * Day-keyed idempotency for cron digests (morning brief, overdue nudge).
 * Prefers Upstash Redis SET NX; falls back to CronLog primary key; then memory.
 */
import { Redis } from '@upstash/redis'
import { prisma, withPrismaFallback } from '@/lib/db'

const TTL_SEC = 36 * 60 * 60
const memory = new Set<string>()

let redis: Redis | null | undefined

function getRedis(): Redis | null {
  if (redis !== undefined) return redis
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!url || !token) {
    redis = null
    return null
  }
  redis = new Redis({ url, token })
  return redis
}

/**
 * Claim a once-per-day key. Returns true if this caller owns the send.
 * @param key stable id e.g. `morning:2026-08-09:-100123`
 */
export async function claimDigestDayKey(key: string): Promise<boolean> {
  const safe = key.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 180)
  if (!safe) return true

  const r = getRedis()
  if (r) {
    try {
      const res = await r.set(`ab:digest:${safe}`, '1', {
        nx: true,
        ex: TTL_SEC,
      })
      if (res === null) {
        memory.add(safe)
        return false
      }
      memory.add(safe)
      return true
    } catch (e) {
      console.warn('[digest] day-claim redis', e)
      /* fall through */
    }
  }

  if (memory.has(safe)) return false

  const logId = `digest-claim-${safe}`
  const existing = await withPrismaFallback(
    () =>
      prisma.cronLog.findUnique({
        where: { id: logId },
        select: { id: true },
      }),
    null
  )
  if (existing) {
    memory.add(safe)
    return false
  }

  const created = await withPrismaFallback(async () => {
    try {
      await prisma.cronLog.create({
        data: {
          id: logId,
          taskId: safe,
          taskNameAr: 'قفل ملخص يومي',
          channel: 'digest',
          status: 'success',
          details: 'day_claim',
        },
      })
      return true
    } catch {
      // Unique id race — another instance claimed first
      return false
    }
  }, null)

  if (created === false) {
    memory.add(safe)
    return false
  }
  if (created === true) {
    memory.add(safe)
    return true
  }

  // Prisma unavailable: memory-only (best effort on this instance)
  memory.add(safe)
  return true
}

/** Test helper. */
export function __resetDigestDayClaimsForTests() {
  memory.clear()
}
