import { describe, expect, it } from 'vitest'
import {
  isTelegramPersonalCalendarTool,
  omitTelegramPersonalCalendarTools,
  TELEGRAM_OMIT_PERSONAL_CALENDAR_TOOLS,
} from '@/lib/telegram/tools-policy'
import { mapTaskToBuiltinFreeTools } from '@/lib/agents/tools/free-execute-map'
import { mapChatErrorAr } from '@/lib/ai/user-error-ar'
import { formatTelegramErrorAr } from '@/lib/telegram/errors-ar'
import {
  TELEGRAM_SITE_CHAT_TOOLS,
  TELEGRAM_SITE_HEAVY_TOOLS,
} from '@/lib/telegram/power-path'

describe('omitTelegramPersonalCalendarTools', () => {
  it('lists personal calendar tools to omit', () => {
    expect(TELEGRAM_OMIT_PERSONAL_CALENDAR_TOOLS).toContain(
      'calendar_list_events'
    )
    expect(TELEGRAM_OMIT_PERSONAL_CALENDAR_TOOLS).toContain(
      'calendar_create_event'
    )
    expect(isTelegramPersonalCalendarTool('calendar_list_events')).toBe(true)
    expect(isTelegramPersonalCalendarTool('room_calendar_list')).toBe(false)
  })

  it('removes personal calendar keys and keeps room calendar', () => {
    const fake = {
      calendar_list_events: { description: 'x' },
      calendar_create_event: { description: 'y' },
      room_calendar_list: { description: 'z' },
      find_storage_mesh: { description: 'm' },
    } as unknown as import('ai').ToolSet
    const out = omitTelegramPersonalCalendarTools(fake)
    expect(out.calendar_list_events).toBeUndefined()
    expect(out.calendar_create_event).toBeUndefined()
    expect(out.room_calendar_list).toBeTruthy()
    expect(out.find_storage_mesh).toBeTruthy()
  })
})

describe('Telegram free-execute mesh/archive', () => {
  it('maps missing-file / mesh search to find_storage_mesh', () => {
    const hints = mapTaskToBuiltinFreeTools('وين الملف؟ دور في الشبكة')
    expect(hints.some((h) => h.toolName === 'find_storage_mesh')).toBe(true)
    expect(hints[0]?.instructionAr).not.toMatch(/أعد الإرسال/)
  })

  it('maps archive group ask to archive_telegram_group', () => {
    const hints = mapTaskToBuiltinFreeTools('أرشف المجموعة إلى Drive')
    expect(hints.some((h) => h.toolName === 'archive_telegram_group')).toBe(
      true
    )
  })
})

describe('Telegram tool subsets include mesh tools', () => {
  it('exposes find_storage_mesh on chat and heavy lists', () => {
    expect(TELEGRAM_SITE_CHAT_TOOLS).toContain('find_storage_mesh')
    expect(TELEGRAM_SITE_HEAVY_TOOLS).toContain('find_storage_mesh')
    expect(TELEGRAM_SITE_HEAVY_TOOLS).toContain('archive_telegram_group')
  })

  it('never lists personal calendar on Telegram subsets', () => {
    for (const name of TELEGRAM_OMIT_PERSONAL_CALENDAR_TOOLS) {
      expect(TELEGRAM_SITE_CHAT_TOOLS as readonly string[]).not.toContain(name)
      expect(TELEGRAM_SITE_HEAVY_TOOLS as readonly string[]).not.toContain(name)
    }
  })
})

describe('timeout errors avoid spam resend', () => {
  it('mapChatErrorAr timeout does not say أعد الإرسال', () => {
    const msg = mapChatErrorAr('ETIMEDOUT')
    expect(msg).toMatch(/مهلة/)
    expect(msg).not.toMatch(/أعد الإرسال/)
  })

  it('formatTelegramErrorAr timeout prefers silent resume', () => {
    const msg = formatTelegramErrorAr(new Error('deadline exceeded'))
    expect(msg).toMatch(/مهلة/)
    expect(msg).toMatch(/بدون إعادة إرسال|تُستأنف/)
  })
})
