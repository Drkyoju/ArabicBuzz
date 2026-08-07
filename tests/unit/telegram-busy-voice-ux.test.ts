import { describe, expect, it } from 'vitest'
import { pickAgentSeatsForMessage } from '@/lib/rooms/wake-policy'
import type { RoomAgent } from '@/lib/rooms/agents'
import {
  buildVoiceQuickKeyboard,
  formatVoiceSttSummaryAr,
} from '@/lib/telegram/voice-quick'

const seats: RoomAgent[] = [
  {
    id: 'a1',
    slug: 'agent1',
    nameAr: 'وكيل١',
    systemPromptAr: '',
    avatarHue: 120,
  },
  {
    id: 'a2',
    slug: 'agent2',
    nameAr: 'وكيل٢',
    systemPromptAr: '',
    avatarHue: 200,
  },
]

describe('wake-policy busy queue', () => {
  it('explains full queue in Arabic when all seats busy', () => {
    const pick = pickAgentSeatsForMessage({
      seated: seats,
      busyAgentIds: ['a1', 'a2'],
    })
    expect(pick.agents).toHaveLength(0)
    expect(pick.noticeAr).toMatch(/الطابور|يعمل/)
    expect(pick.noticeAr).toMatch(/وكيل/)
  })

  it('mentions queue when cascading to seat 2', () => {
    const pick = pickAgentSeatsForMessage({
      seated: seats,
      busyAgentIds: ['a1'],
    })
    expect(pick.agents[0]?.id).toBe('a2')
    expect(pick.noticeAr).toMatch(/وكيل٢|الطابور|يعمل/)
  })
})

describe('voice quick UX', () => {
  it('keeps voice summary short', () => {
    const long = 'أ'.repeat(400)
    const text = formatVoiceSttSummaryAr({
      transcript: long,
      intentLabelAr: 'موعد',
      providerLabelAr: 'Gemini',
    })
    expect(text.length).toBeLessThan(500)
    expect(text).toMatch(/فهمت/)
    expect(text).toMatch(/القصد/)
  })

  it('builds compact keyboard labels', () => {
    const kb = buildVoiceQuickKeyboard()
    const json = JSON.stringify(kb)
    expect(json).toMatch(/نفّذ/)
    expect(json).toMatch(/موعد/)
    expect(json).toMatch(/بريد/)
    expect(json).toMatch(/أيقظ/)
    expect(json).toMatch(/للمجموعة/)
  })
})
