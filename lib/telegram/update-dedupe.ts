/**
 * Deduplicate Telegram webhook deliveries by update_id.
 * Telegram retries when the handler is slow; without a claim gate the
 * same message can spawn multiple agent replies.
 *
 * Prefers Upstash Redis SET NX (cross-instance on Netlify); falls back
 * to process memory for same-instance / local.
 */

import { Redis } from '@upstash/redis'

const TTL_MS = 10 * 60 * 1000
const TTL_SEC = 600
const memory = new Map<number, number>()

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

function pruneMemory(now: number) {
  if (memory.size < 64) return
  for (const [id, ts] of memory) {
    if (now - ts > TTL_MS) memory.delete(id)
  }
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
      /* fall through to memory */
    }
  }

  if (memory.has(id)) return false
  memory.set(id, now)
  return true
}

/** Test helper — clear in-memory claims. */
export function __resetTelegramUpdateDedupeForTests() {
  memory.clear()
}
