/**
 * Room agent wake/sleep policy:
 * - Habitual: all seats asleep (نائم)
 * - New message → wake first free seat (وكيل١, then ٢ while ١ busy, …)
 * - @mention / manual click still wakes that seat
 * - After the run → seat returns to نائم
 */

import type { RoomAgent } from '@/lib/rooms/agents'

export type WakePickResult = {
  agents: RoomAgent[]
  /** Seats woken for this run (set online for UI, then sleep after). */
  wokeIds: string[]
  noticeAr?: string
}

/**
 * Pick which seat(s) should handle a message under the wake/sleep policy.
 * Uses full seating order (not only currently-online seats).
 */
export function pickAgentSeatsForMessage(opts: {
  seated: RoomAgent[]
  busyAgentIds?: Iterable<string>
  mentioned?: RoomAgent[]
  wantsAll?: boolean
  teamCap?: number
}): WakePickResult {
  const seated = opts.seated || []
  if (!seated.length) {
    return { agents: [], wokeIds: [] }
  }

  const busy = new Set(opts.busyAgentIds || [])
  const cap = Math.max(1, Math.floor(opts.teamCap ?? 8))
  const mentioned = opts.mentioned || []

  if (opts.wantsAll) {
    const agents = seated.slice(0, cap)
    return {
      agents,
      wokeIds: agents.map((a) => a.id),
      noticeAr: `أُيقظ ${agents.length} مقاعد للبث للجميع`,
    }
  }

  if (mentioned.length) {
    const byId = new Map(seated.map((a) => [a.id, a]))
    const agents = mentioned
      .map((m) => byId.get(m.id) || m)
      .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)
      .slice(0, cap)
    return {
      agents,
      wokeIds: agents.map((a) => a.id),
      noticeAr:
        agents.length === 1
          ? `أُيقظ @${agents[0].slug} بالإشارة`
          : `أُيقظ ${agents.length} وكلاء بالإشارة`,
    }
  }

  // Cascade: first seat that is not busy (order = وكيل١, وكيل٢, …)
  const freeIdx = seated.findIndex((a) => !busy.has(a.id))
  if (freeIdx < 0) {
    return {
      agents: [],
      wokeIds: [],
      noticeAr: 'كل الوكلاء يعملون الآن — انتظر أو أوقف تشغيلاً ثم أعد الإرسال.',
    }
  }

  const free = seated[freeIdx]
  const noticeAr =
    freeIdx === 0
      ? undefined
      : `أُيقظ ${free.nameAr} تلقائياً لأن المقعد السابق ما زال يعمل`

  return {
    agents: [free],
    wokeIds: [free.id],
    noticeAr,
  }
}
