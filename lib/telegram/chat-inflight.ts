/**
 * In-flight + recent-reply locks for Telegram chats.
 * Prevents parallel agent turns on the same user message (webhook races,
 * double-tap same text, cascade re-entry) from posting duplicate replies.
 *
 * Prefers Upstash Redis SET NX; falls back to Prisma CronLog (TTL via ranAt);
 * then process memory.
 */

import { Redis } from '@upstash/redis'
import { prisma, withPrismaFallback } from '@/lib/db'

const TURN_TTL_SEC = 180
const RECENT_TTL_SEC = 90
const memoryTurns = new Map<string, number>()
const memoryRecent = new Map<string, number>()

let redis: Redis | null | undefined

function prismaLockEnabled(): boolean {
  if (process.env.VITEST != null) return false
  if (process.env.TELEGRAM_DEDUPE_PRISMA === '0') return false
  return true
}

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

function prune(map: Map<string, number>, now: number, ttlMs: number) {
  if (map.size < 48) return
  for (const [k, ts] of map) {
    if (now - ts > ttlMs) map.delete(k)
  }
}

function fingerprintKey(chatId: string, fingerprint: string): string {
  const safeChat = String(chatId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  const safeFp = String(fingerprint)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 96)
  return `${safeChat}:${safeFp}`
}

function cronLogIdFor(redisKey: string): string {
  return `tg-lock-${redisKey}`.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 180)
}

async function prismaHasFresh(logId: string, ttlSec: number): Promise<boolean> {
  const row = await withPrismaFallback(
    () =>
      prisma.cronLog.findUnique({
        where: { id: logId },
        select: { ranAt: true },
      }),
    null
  )
  if (!row) return false
  const age = Date.now() - new Date(row.ranAt).getTime()
  if (age < ttlSec * 1000) return true
  await withPrismaFallback(
    () => prisma.cronLog.delete({ where: { id: logId } }).catch(() => null),
    null
  )
  return false
}

async function prismaClaim(logId: string, ttlSec: number): Promise<boolean | null> {
  if (await prismaHasFresh(logId, ttlSec)) return false
  return withPrismaFallback(async () => {
    try {
      await prisma.cronLog.create({
        data: {
          id: logId,
          taskId: logId.slice(0, 120),
          taskNameAr: 'قفل دورة تيليجرام',
          channel: 'telegram',
          status: 'success',
          details: `ttl=${ttlSec}`,
        },
      })
      return true
    } catch {
      // Unique race — treat as claimed by peer if still fresh
      if (await prismaHasFresh(logId, ttlSec)) return false
      return false
    }
  }, null)
}

async function prismaRelease(logId: string): Promise<void> {
  await withPrismaFallback(
    () => prisma.cronLog.delete({ where: { id: logId } }).catch(() => null),
    null
  )
}

async function hasKey(
  redisKey: string,
  memory: Map<string, number>,
  ttlSec: number
): Promise<boolean> {
  const now = Date.now()
  prune(memory, now, ttlSec * 1000)
  const memTs = memory.get(redisKey)
  if (memTs != null && now - memTs < ttlSec * 1000) return true

  const r = getRedis()
  if (r) {
    try {
      const v = await r.get(redisKey)
      if (v != null) {
        memory.set(redisKey, now)
        return true
      }
    } catch (e) {
      console.warn('[telegram] chat-inflight redis get', e)
    }
  }

  if (prismaLockEnabled() && (await prismaHasFresh(cronLogIdFor(redisKey), ttlSec))) {
    memory.set(redisKey, now)
    return true
  }
  return false
}

async function claimNx(
  redisKey: string,
  memory: Map<string, number>,
  ttlSec: number
): Promise<boolean> {
  const now = Date.now()
  prune(memory, now, ttlSec * 1000)

  const r = getRedis()
  if (r) {
    try {
      const res = await r.set(redisKey, '1', { nx: true, ex: ttlSec })
      if (res === null) {
        memory.set(redisKey, now)
        return false
      }
      memory.set(redisKey, now)
      return true
    } catch (e) {
      console.warn('[telegram] chat-inflight redis set', e)
      /* fall through */
    }
  }

  if (memory.has(redisKey)) {
    const ts = memory.get(redisKey)!
    if (now - ts < ttlSec * 1000) return false
  }

  if (prismaLockEnabled()) {
    const db = await prismaClaim(cronLogIdFor(redisKey), ttlSec)
    if (db === false) {
      memory.set(redisKey, now)
      return false
    }
  }

  memory.set(redisKey, now)
  return true
}

async function releaseNx(
  redisKey: string,
  memory: Map<string, number>
): Promise<void> {
  memory.delete(redisKey)
  const r = getRedis()
  if (r) {
    try {
      await r.del(redisKey)
    } catch {
      /* ignore */
    }
  }
  if (prismaLockEnabled()) {
    await prismaRelease(cronLogIdFor(redisKey))
  }
}

/**
 * Claim an in-flight turn for this chat+message fingerprint.
 * @returns false if the same request is already running or was answered recently.
 */
export async function claimTelegramChatTurn(
  chatId: string,
  fingerprint: string
): Promise<boolean> {
  if (!String(chatId).trim() || !String(fingerprint).trim()) return true
  const key = fingerprintKey(chatId, fingerprint)

  if (await hasKey(`ab:tg:recent:${key}`, memoryRecent, RECENT_TTL_SEC)) {
    return false
  }
  return claimNx(`ab:tg:turn:${key}`, memoryTurns, TURN_TTL_SEC)
}

/**
 * End in-flight turn. Marks fingerprint as recently answered so identical
 * retries/double-taps do not produce a second reply for RECENT_TTL_SEC.
 */
export async function releaseTelegramChatTurn(
  chatId: string,
  fingerprint: string,
  opts?: { answered?: boolean }
): Promise<void> {
  if (!String(chatId).trim() || !String(fingerprint).trim()) return
  const key = fingerprintKey(chatId, fingerprint)
  await releaseNx(`ab:tg:turn:${key}`, memoryTurns)
  if (opts?.answered !== false) {
    await claimNx(`ab:tg:recent:${key}`, memoryRecent, RECENT_TTL_SEC)
  }
}

/** Build a stable fingerprint from Telegram message identity or text. */
export function telegramTurnFingerprint(opts: {
  updateId?: number | null
  messageId?: number | null
  text?: string
}): string {
  if (
    typeof opts.messageId === 'number' &&
    Number.isFinite(opts.messageId) &&
    opts.messageId > 0
  ) {
    return `m${opts.messageId}`
  }
  if (
    typeof opts.updateId === 'number' &&
    Number.isFinite(opts.updateId) &&
    opts.updateId > 0
  ) {
    return `u${opts.updateId}`
  }
  const t = String(opts.text || '')
    .trim()
    .slice(0, 120)
    .toLowerCase()
  if (t) return `t${simpleHash(t)}`
  return `x${Date.now()}`
}

function simpleHash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/** Test helper. */
export function __resetTelegramChatInflightForTests() {
  memoryTurns.clear()
  memoryRecent.clear()
}
