import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const memory = new Map<string, { count: number; resetAt: number }>()

function parseIp(raw?: string | null) {
  if (!raw) return 'unknown'
  return raw.split(',')[0]?.trim() || 'unknown'
}

function inMemoryLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const cur = memory.get(key)
  if (!cur || now >= cur.resetAt) {
    memory.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: limit - 1, reset: now + windowMs }
  }
  cur.count += 1
  memory.set(key, cur)
  return {
    success: cur.count <= limit,
    remaining: Math.max(0, limit - cur.count),
    reset: cur.resetAt,
  }
}

let upstashLimiter: Ratelimit | null = null
function getUpstashLimiter(limit: number, windowMs: number) {
  if (upstashLimiter) return upstashLimiter
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!url || !token) return null
  const redis = new Redis({ url, token })
  upstashLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${Math.ceil(windowMs / 1000)} s`),
    prefix: 'ab:webhook',
  })
  return upstashLimiter
}

export async function enforceWebhookRateLimit(opts: {
  req: Request
  channel: 'telegram' | 'whatsapp' | 'room-webhook'
}) {
  const limit = Number(process.env.WEBHOOK_RATE_LIMIT_PER_MIN || 60)
  const windowMs = 60_000
  const ip = parseIp(opts.req.headers.get('x-forwarded-for'))
  const key = `${opts.channel}:${ip}`

  const upstash = getUpstashLimiter(limit, windowMs)
  if (upstash) {
    const res = await upstash.limit(key)
    return {
      ok: res.success,
      remaining: res.remaining,
      reset: Date.now() + (res.reset ? res.reset - Date.now() : windowMs),
    }
  }

  const local = inMemoryLimit(key, limit, windowMs)
  return { ok: local.success, remaining: local.remaining, reset: local.reset }
}

/** Generic API rate limit (posts, settings mutations). */
export async function enforceApiRateLimit(opts: {
  req: Request
  bucket: string
  limit?: number
  windowMs?: number
}) {
  const limit = opts.limit ?? Number(process.env.API_RATE_LIMIT_PER_MIN || 40)
  const windowMs = opts.windowMs ?? 60_000
  const ip = parseIp(opts.req.headers.get('x-forwarded-for'))
  const auth = opts.req.headers.get('authorization') || ''
  const who = auth.slice(0, 32) || ip
  const key = `api:${opts.bucket}:${who}`
  const local = inMemoryLimit(key, limit, windowMs)
  return { ok: local.success, remaining: local.remaining, reset: local.reset }
}

