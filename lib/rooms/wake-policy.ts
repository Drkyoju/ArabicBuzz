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
    // Prefer free seats so busy وكيل١ does not block وكيل٢…N from helping.
    const free = seated.filter((a) => !busy.has(a.id)).slice(0, cap)
    if (!free.length) {
      const busyNames = seated
        .filter((a) => busy.has(a.id))
        .map((a) => a.nameAr)
        .slice(0, 4)
      const who = busyNames.length ? ` (${busyNames.join('، ')})` : ''
      return {
        agents: [],
        wokeIds: [],
        noticeAr: [
          `⏳ الطابور ممتلئ — كل المقاعد تعمل الآن${who}.`,
          'رسالتك محفوظة عند الإعادة: انتظر قليلاً ثم أعد الإرسال، أو أوقف تشغيلاً من الموقع.',
          'لا تُحذف رسائل تيليجرام — سنرد بتعديل/رسالة جديدة عند التفرّغ.',
        ].join('\n'),
      }
    }
    const skippedBusy = seated.filter((a) => busy.has(a.id)).length
    return {
      agents: free,
      wokeIds: free.map((a) => a.id),
      noticeAr:
        skippedBusy > 0
          ? `أُيقظ ${free.length} مقاعد متفرّغة للفريق (تخطّي ${skippedBusy} مشغول).`
          : `أُيقظ ${free.length} مقاعد للبث للجميع`,
    }
  }

  if (mentioned.length) {
    const byId = new Map(seated.map((a) => [a.id, a]))
    const mentionedUnique = mentioned
      .map((m) => byId.get(m.id) || m)
      .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)
    // Multi-mention: wake free mentioned seats; skip ones already busy.
    const freeMentioned = mentionedUnique.filter((a) => !busy.has(a.id))
    const agents = (freeMentioned.length ? freeMentioned : mentionedUnique).slice(
      0,
      cap
    )
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
    const busyNames = seated
      .filter((a) => busy.has(a.id))
      .map((a) => a.nameAr)
      .slice(0, 4)
    const who =
      busyNames.length > 0 ? ` (${busyNames.join('، ')})` : ''
    return {
      agents: [],
      wokeIds: [],
      noticeAr: [
        `⏳ الطابور ممتلئ — كل المقاعد تعمل الآن${who}.`,
        'رسالتك محفوظة عند الإعادة: انتظر قليلاً ثم أعد الإرسال، أو أوقف تشغيلاً من الموقع.',
        'لا تُحذف رسائل تيليجرام — سنرد بتعديل/رسالة جديدة عند التفرّغ.',
      ].join('\n'),
    }
  }

  const free = seated[freeIdx]
  const busyAhead = freeIdx
  const noticeAr =
    freeIdx === 0
      ? undefined
      : [
          `أُيقظ ${free.nameAr} لأن ${busyAhead} مقعد${busyAhead > 1 ? 'اً' : ''} قبله ما زال يعمل.`,
          'أنت في الطابور التالي — جاري التنفيذ الآن.',
        ].join('\n')


  return {
    agents: [free],
    wokeIds: [free.id],
    noticeAr,
  }
}
