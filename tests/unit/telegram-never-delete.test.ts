import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertTelegramApiMethodAllowed,
  isTelegramDeleteApiMethod,
  telegramMethodFromUrl,
  telegramNeverDelete,
  TelegramNeverDeleteError,
  TELEGRAM_NEVER_DELETE_METHODS,
} from '@/lib/telegram/never-delete'

describe('telegram never-delete policy', () => {
  it('flags all banned Bot API methods', () => {
    for (const m of TELEGRAM_NEVER_DELETE_METHODS) {
      expect(isTelegramDeleteApiMethod(m)).toBe(true)
      expect(isTelegramDeleteApiMethod(m.toLowerCase())).toBe(true)
    }
  })

  it('allows send/edit and operational deleteWebhook', () => {
    expect(isTelegramDeleteApiMethod('sendMessage')).toBe(false)
    expect(isTelegramDeleteApiMethod('editMessageText')).toBe(false)
    expect(isTelegramDeleteApiMethod('deleteWebhook')).toBe(false)
    expect(isTelegramDeleteApiMethod('deleteMyCommands')).toBe(false)
    expect(isTelegramDeleteApiMethod('getMe')).toBe(false)
  })

  it('parses method from api.telegram.org URLs', () => {
    expect(
      telegramMethodFromUrl(
        'https://api.telegram.org/bot123:ABC/deleteMessage'
      )
    ).toBe('deleteMessage')
    expect(
      telegramMethodFromUrl(
        'https://api.telegram.org/bot123:ABC/sendMessage'
      )
    ).toBe('sendMessage')
  })

  it('telegramNeverDelete always throws', () => {
    expect(() => telegramNeverDelete('deleteMessage')).toThrow(
      TelegramNeverDeleteError
    )
  })

  it('assertTelegramApiMethodAllowed blocks deletes', () => {
    expect(() => assertTelegramApiMethodAllowed('deleteMessages')).toThrow(
      TelegramNeverDeleteError
    )
    expect(() => assertTelegramApiMethodAllowed('sendMessage')).not.toThrow()
  })

  it('blocks history-destroying methods beyond delete*', () => {
    for (const m of [
      'unpinAllChatMessages',
      'unpinAllForumTopicMessages',
      'leaveChat',
      'banChatMember',
      'closeForumTopic',
    ]) {
      expect(isTelegramDeleteApiMethod(m)).toBe(true)
    }
    // Pinning / unpinning a single message stays allowed.
    expect(isTelegramDeleteApiMethod('unpinChatMessage')).toBe(false)
    expect(isTelegramDeleteApiMethod('pinChatMessage')).toBe(false)
  })
})

/**
 * The runtime guard only protects calls that go through grammy or
 * telegramBotApiFetch. A raw fetch to the Bot API would silently bypass it,
 * so the guarantee is enforced at the source level too.
 */
describe('no un-guarded Bot API call sites', () => {
  const ROOT = join(__dirname, '..', '..')
  const SCAN_DIRS = ['lib', 'app', 'components']
  const ALLOWED = new Set(['lib/telegram/never-delete.ts'])

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }

  it('routes every api.telegram.org/bot call through the guard', () => {
    const offenders: string[] = []
    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = file.slice(ROOT.length + 1)
        if (ALLOWED.has(rel)) continue
        const src = readFileSync(file, 'utf8')
        const lines = src.split('\n')
        lines.forEach((line, i) => {
          // /file/bot<token>/... is a CDN download, not a Bot API method call.
          if (!line.includes('api.telegram.org') || line.includes('/file/bot')) {
            return
          }
          const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n')
          if (!context.includes('telegramBotApiFetch')) {
            offenders.push(`${rel}:${i + 1}`)
          }
        })
      }
    }
    expect(offenders).toEqual([])
  })
})
