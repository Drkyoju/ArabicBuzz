/**
 * Deduplicate Telegram webhook deliveries by update_id.
 * Telegram retries when the handler is slow; without a claim gate the
 * same message can spawn multiple agent replies.
 *
 * Prefers Upstash Redis SET NX (cross-instance); falls back to Prisma
 * CronLog (same pattern as digest day-claim); then process memory.
 */

import { Redis } from '@upstash/redis'
import { prisma, withPrismaFallback } from '@/lib/db'

const TTL_MS = 10 * 60 * 1000
const TTL_SEC = 600
const memory = new Map<number, number>()

let redis: Redis | null | undefined

/** Unit tests stay memory-only so shared CronLog rows do not flake. */
function prismaDedupeEnabled(): boolean {
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

function pruneMemory(now: number) {
  if (memory.size < 64) return
  for (const [id, ts] of memory) {
    if (now - ts > TTL_MS) memory.delete(id)
  }
}

async function claimViaCronLog(logId: string, now: number): Promise<boolean> {
  const existing = await withPrismaFallback(
    () =>
      prisma.cronLog.findUnique({
        where: { id: logId },
        select: { id: true, ranAt: true },
      }),
    null
  )
  if (existing) {
    const age = now - new Date(existing.ranAt).getTime()
    if (age < TTL_MS) return false
    await withPrismaFallback(
      () => prisma.cronLog.delete({ where: { id: logId } }).catch(() => null),
      null
    )
  }

  const created = await withPrismaFallback(async () => {
    try {
      await prisma.cronLog.create({
        data: {
          id: logId,
          taskId: logId.slice(0, 120),
          taskNameAr: 'قفل تحديث تيليجرام',
          channel: 'telegram',
          status: 'success',
          details: 'update_dedupe',
        },
      })
      return true
    } catch {
      return false
    }
  }, null)

  if (created === false) return false
  if (created === true) return true
  return true // prisma unavailable → caller uses memory
}

/**
 * @returns true if this process should handle the update; false if duplicate.
 * Missing/invalid update_id is treated as claimable (fail-open).
 */
export async function claimTelegramUpdate(
  updateId: unknown
): Promise<boolean> {
  const id = typeof updateId === 'number' ? updateId : Number(updateId)
  if (!Number.isFinite(id) || id <= 0) return true

  const now = Date.now()
  pruneMemory(now)

  const r = getRedis()
  if (r) {
    try {
      const res = await r.set(`ab:tg:upd:${id}`, '1', {
        nx: true,
        ex: TTL_SEC,
      })
      if (res === null) {
        memory.set(id, now)
        return false
      }
      memory.set(id, now)
      return true
    } catch (e) {
      console.warn('[telegram] update dedupe redis', e)
      /* fall through */
    }
  }

  if (memory.has(id)) {
    const ts = memory.get(id)!
    if (now - ts < TTL_MS) return false
  }

  if (prismaDedupeEnabled()) {
    const dbOk = await claimViaCronLog(`tg-upd-${id}`, now)
    if (!dbOk) {
      memory.set(id, now)
      return false
    }
  }

  memory.set(id, now)
  return true
}

/**
 * Secondary claim by chat + message_id (covers rare cases where the same
 * message arrives under a different update_id, e.g. edited_message fan-out).
 */
export async function claimTelegramMessageKey(
  chatId: unknown,
  messageId: unknown
): Promise<boolean> {
  const cid = String(chatId ?? '').trim()
  const mid =
    typeof messageId === 'number' ? messageId : Number(messageId)
  if (!cid || !Number.isFinite(mid) || mid <= 0) return true
  const safeChat = cid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  const key = `ab:tg:msg:${safeChat}:${mid}`
  const logId = `tg-msg-${safeChat}-${mid}`.slice(0, 180)

  const now = Date.now()
  pruneMemory(now)

  const r = getRedis()
  if (r) {
    try {
      const res = await r.set(key, '1', { nx: true, ex: TTL_SEC })
      if (res === null) return false
      return true
    } catch (e) {
      console.warn('[telegram] message dedupe redis', e)
    }
  }

  const memId = simpleMemId(safeChat, mid)
  if (memory.has(memId)) {
    const ts = memory.get(memId)!
    if (now - ts < TTL_MS) return false
  }

  if (prismaDedupeEnabled()) {
    const dbOk = await claimViaCronLog(logId, now)
    if (!dbOk) {
      memory.set(memId, now)
      return false
    }
  }

  memory.set(memId, now)
  return true
}

const CONTENT_TTL_SEC = 120
const CONTENT_TTL_MS = CONTENT_TTL_SEC * 1000

function normalizeContentText(text: unknown): string {
  return String(text || '')
    .trim()
    .replace(/\s+/gu, ' ')
    .slice(0, 240)
    .toLowerCase()
}

function contentHash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/**
 * Tertiary claim by chat + sender + text fingerprint.
 * Covers Telegram retries that somehow arrive with a NEW update_id / message_id
 * but the same body (slow webhook → redelivery races), and user double-tap.
 */
export async function claimTelegramContentKey(
  chatId: unknown,
  fromUserId: unknown,
  text: unknown
): Promise<boolean> {
  const cid = String(chatId ?? '').trim()
  const uid = String(fromUserId ?? '').trim()
  const norm = normalizeContentText(text)
  if (!cid || !uid || norm.length < 2) return true

  const safeChat = cid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)
  const hash = contentHash(norm)
  const key = `ab:tg:txt:${safeChat}:${safeUid}:${hash}`
  const logId = `tg-txt-${safeChat}-${safeUid}-${hash}`.slice(0, 180)

  const now = Date.now()
  pruneMemory(now)

  const r = getRedis()
  if (r) {
    try {
      const res = await r.set(key, '1', { nx: true, ex: CONTENT_TTL_SEC })
      if (res === null) return false
      return true
    } catch (e) {
      console.warn('[telegram] content dedupe redis', e)
    }
  }

  const memId = simpleMemId(`${safeChat}:${safeUid}`, Number.parseInt(hash, 36) || 1)
  if (memory.has(memId)) {
    const ts = memory.get(memId)!
    if (now - ts < CONTENT_TTL_MS) return false
  }

  if (prismaDedupeEnabled()) {
    const dbOk = await claimViaCronLog(logId, now)
    if (!dbOk) {
      memory.set(memId, now)
      return false
    }
  }

  memory.set(memId, now)
  return true
}

function simpleMemId(chat: string, mid: number): number {
  let h = mid | 0
  for (let i = 0; i < chat.length; i++) {
    h = (Math.imul(h, 31) + chat.charCodeAt(i)) | 0
  }
  return h === 0 ? mid : Math.abs(h)
}

/** Test helper — clear in-memory claims. */
export function __resetTelegramUpdateDedupeForTests() {
  memory.clear()
}
