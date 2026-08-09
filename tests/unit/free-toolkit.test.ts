import { describe, expect, it } from 'vitest'
import {
  EXCELLENT_FREE_TOOLKIT,
  freeToolkitParityTableAr,
  freeToolkitReadyIds,
} from '@/lib/agents/free-toolkit'
import { EMPLOYEE_SAFE_TOOLS } from '@/lib/agents/tools-by-role'
import { TELEGRAM_SITE_CHAT_TOOLS } from '@/lib/telegram/power-path'
import { buildTelegramHelpAr } from '@/lib/telegram/help-copy'

const BOT_TOOL_IDS = [
  'wikipedia_lookup',
  'youtube_transcript',
  'math_eval',
  'domain_intel',
  'arxiv_search',
  'find_storage_mesh',
  'archive_telegram_group',
  'pdf_duplicate_page',
  'web_search',
  'web_fetch',
] as const

describe('excellent free toolkit checklist', () => {
  it('marks all target items ready on both sides', () => {
    expect(EXCELLENT_FREE_TOOLKIT.length).toBeGreaterThanOrEqual(15)
    expect(freeToolkitReadyIds()).toEqual(
      EXCELLENT_FREE_TOOLKIT.map((i) => i.id)
    )
    for (const item of EXCELLENT_FREE_TOOLKIT) {
      expect(item.bothReady).toBe(true)
      expect(item.bot.length).toBeGreaterThan(2)
      expect(item.hermes.length).toBeGreaterThan(2)
    }
  })

  it('parity table states systems stay unlinked', () => {
    const table = freeToolkitParityTableAr()
    expect(table).toMatch(/أنظمة منفصلة/)
    expect(table).toMatch(/بلا ربط/)
    expect(table).toMatch(/هيرميس/)
    expect(table).toMatch(/alhuda14bot/)
  })

  it('telegram help mentions parallel Hermes (unlinked)', () => {
    const help = buildTelegramHelpAr({ botUsername: 'alhuda14bot' })
    expect(help).toMatch(/هيرميس واتساب منفصل/)
    expect(help).toMatch(/بلا ربط/)
  })

  it('bot surfaces expose core free knowledge + mesh tools', () => {
    for (const name of BOT_TOOL_IDS) {
      expect(EMPLOYEE_SAFE_TOOLS).toContain(name)
      expect(TELEGRAM_SITE_CHAT_TOOLS).toContain(name)
    }
  })
})
