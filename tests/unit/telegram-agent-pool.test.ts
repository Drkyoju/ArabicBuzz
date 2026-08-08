import { describe, expect, it } from 'vitest'
import { pickAgentSeatsForMessage } from '@/lib/rooms/wake-policy'
import type { RoomAgent } from '@/lib/rooms/agents'
import {
  expandTelegramAgentPool,
  seatedAgentsFromRosterPayload,
  shouldTelegramTeamFanOut,
  getTelegramAgentMaxParallel,
} from '@/lib/telegram/agent-pool'
import {
  buildTelegramPowerPrompt,
  classifyTelegramWorkIntent,
  markTelegramSeatBusy,
  markTelegramSeatFree,
} from '@/lib/telegram/power-path'
import { BUILTIN_ROOM_AGENTS } from '@/lib/rooms/agents'

const seats: RoomAgent[] = BUILTIN_ROOM_AGENTS.slice(0, 6)

describe('wake-policy team free seats', () => {
  it('skips busy seats on wantsAll so later agents still help', () => {
    const pick = pickAgentSeatsForMessage({
      seated: seats,
      busyAgentIds: [seats[0].id],
      wantsAll: true,
      teamCap: 4,
    })
    expect(pick.agents.length).toBeGreaterThanOrEqual(2)
    expect(pick.agents.every((a) => a.id !== seats[0].id)).toBe(true)
    expect(pick.noticeAr).toMatch(/متفرّغة|للجميع/)
  })

  it('returns queue-full when all busy on wantsAll', () => {
    const pick = pickAgentSeatsForMessage({
      seated: seats.slice(0, 2),
      busyAgentIds: [seats[0].id, seats[1].id],
      wantsAll: true,
      teamCap: 4,
    })
    expect(pick.agents).toHaveLength(0)
    expect(pick.noticeAr).toMatch(/الطابور|يعمل/)
  })
})

describe('telegram agent pool', () => {
  it('expands shared-demo starters to full builtin pool', () => {
    const starters = seatedAgentsFromRosterPayload('shared-demo', null)
    expect(starters.length).toBe(4)
    const full = expandTelegramAgentPool(starters)
    expect(full.length).toBe(BUILTIN_ROOM_AGENTS.length)
    expect(full.map((a) => a.nameAr).join()).toMatch(/وكيل١/)
    expect(full.map((a) => a.nameAr).join()).toMatch(/وكيل٦/)
  })

  it('caps parallel at a webhook-safe number', () => {
    expect(getTelegramAgentMaxParallel()).toBeGreaterThanOrEqual(1)
    expect(getTelegramAgentMaxParallel()).toBeLessThanOrEqual(8)
  })

  it('fans out on broadcast / للوكلاء / heavy file', () => {
    expect(
      shouldTelegramTeamFanOut({
        raw: 'أبغا للجميع لخّص الملفات',
        workKind: 'question',
        preferFullAgent: true,
        forceHeavy: false,
        collabMode: 'solo',
        mentionedCount: 0,
        wantsAllToken: false,
        broadcastIntent: false,
      })
    ).toBe(true)

    expect(
      shouldTelegramTeamFanOut({
        raw: 'حوّل هذا الـ PDF',
        workKind: 'file',
        preferFullAgent: true,
        forceHeavy: true,
        collabMode: 'solo',
        mentionedCount: 0,
        wantsAllToken: false,
        broadcastIntent: false,
      })
    ).toBe(true)

    expect(
      shouldTelegramTeamFanOut({
        raw: 'أضف موعد غداً الساعة ١٠',
        workKind: 'appointment',
        preferFullAgent: true,
        forceHeavy: false,
        collabMode: 'solo',
        mentionedCount: 0,
        wantsAllToken: false,
        broadcastIntent: false,
      })
    ).toBe(false)
  })
})

describe('buildTelegramPowerPrompt multi-seat', () => {
  it('wakes multiple free seats for team fan-out', () => {
    const work = classifyTelegramWorkIntent('أبغا للجميع راجع الملفات')
    const powered = buildTelegramPowerPrompt({
      raw: 'أبغا للجميع راجع الملفات',
      scopeId: 'shared-demo',
      work: { ...work, preferFullAgent: true, forceHeavy: true },
      catalog: expandTelegramAgentPool(
        seatedAgentsFromRosterPayload('shared-demo', null)
      ),
      collabMode: 'team',
    })
    expect(powered.wakeAgents.length).toBeGreaterThan(1)
    expect(powered.parallel).toBe(true)
    expect(powered.wakeAgent?.id).toBe(powered.wakeAgents[0]?.id)
  })

  it('cascades to seat 2 when seat 1 busy (solo)', () => {
    const scopeId = 'shared-demo'
    const catalog = expandTelegramAgentPool(
      seatedAgentsFromRosterPayload(scopeId, null)
    )
    markTelegramSeatBusy(scopeId, catalog[0].id)
    try {
      const raw = 'سجّل مهمة: اتصال بالعميل صباح الاثنين'
      const work = classifyTelegramWorkIntent(raw)
      expect(work.kind).toBe('task')
      const powered = buildTelegramPowerPrompt({
        raw,
        scopeId,
        work,
        catalog,
        collabMode: 'solo',
      })
      expect(powered.parallel).toBe(false)
      expect(powered.wakeAgents).toHaveLength(1)
      expect(powered.wakeAgent?.id).toBe(catalog[1].id)
      expect(powered.wakeNoticeAr).toMatch(/أُيقظ|يعمل/)
    } finally {
      markTelegramSeatFree(scopeId, catalog[0].id)
    }
  })
})
