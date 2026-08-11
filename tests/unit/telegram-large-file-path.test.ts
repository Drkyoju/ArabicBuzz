import { describe, expect, it } from 'vitest'
import {
  getTelegramLocalBotApiRoot,
  telegramBotApiFileUrl,
  telegramBotApiMethodUrl,
  telegramBotApiRootsForDownload,
} from '@/lib/telegram/bot-api-root'
import { telegramLargeFilePathStatus } from '@/lib/telegram/large-file-download'
import { isTelegramDownloadLimitError } from '@/lib/telegram/attachment-deliver'

describe('telegram large-file free path', () => {
  it('builds local and cloud roots preferring local', () => {
    const prev = process.env.TELEGRAM_BOT_API_URL
    process.env.TELEGRAM_BOT_API_URL = 'http://127.0.0.1:8081/'
    expect(getTelegramLocalBotApiRoot()).toBe('http://127.0.0.1:8081')
    expect(telegramBotApiRootsForDownload({ preferLocal: true })[0]).toBe(
      'http://127.0.0.1:8081'
    )
    expect(
      telegramBotApiMethodUrl(
        'http://127.0.0.1:8081',
        '1:AA',
        'getFile'
      )
    ).toBe('http://127.0.0.1:8081/bot1:AA/getFile')
    expect(
      telegramBotApiFileUrl('http://127.0.0.1:8081', '1:AA', 'docs/x.pdf')
    ).toBe('http://127.0.0.1:8081/file/bot1:AA/docs/x.pdf')
    process.env.TELEGRAM_BOT_API_URL = prev
  })

  it('status reports free path Arabic without paid gate', () => {
    const s = telegramLargeFilePathStatus()
    expect(s.freePathAr).toMatch(/مجاني|بلا دفع|Bot API|Local/)
    expect(s.freePathAr).not.toMatch(/ادفع|اشتراك مدفوع/)
    expect(s.freePathAr).toMatch(/غرفة|Drive/)
  })

  it('detects cascade limit errors', () => {
    expect(
      isTelegramDownloadLimitError(
        new Error('سجّلت «x» — المهمة في انتظار صامت')
      )
    ).toBe(true)
    expect(
      isTelegramDownloadLimitError(
        new Error('سجّلت «x» — المهمة في طابور انتظار صامت')
      )
    ).toBe(true)
  })
})

describe('telegram hop status Arabic', () => {
  it('formats hop lines for /status', async () => {
    const { formatTelegramHopStatusLinesAr } = await import(
      '@/lib/telegram/large-file-hops'
    )
    const lines = formatTelegramHopStatusLinesAr({
      localBotApi: 'unset',
      macSync: 'down',
      mtproto: 'unset',
    })
    const text = lines.join('\n')
    expect(text).toMatch(/Local Bot API/)
    expect(text).toMatch(/جسر الماك/)
    expect(text).toMatch(/MTProto/)
    expect(text).toMatch(/غرفة|Drive/)
    expect(text).toMatch(/OrbStack|storage:sync|VPS|mac-hop|انتظار/)
    expect(text).toMatch(/انتظار صامت|معلّقة|لا تُلغى/)
    expect(text).toMatch(/متوقف/)
  })

  it('includes Mac LibreOffice/OCR tools when hop is up', async () => {
    const { formatTelegramHopStatusLinesAr } = await import(
      '@/lib/telegram/large-file-hops'
    )
    const lines = formatTelegramHopStatusLinesAr({
      localBotApi: 'up',
      macSync: 'up',
      mtproto: 'unset',
      macTools: { libreoffice: true, tesseract: true },
    })
    const text = lines.join('\n')
    expect(text).toMatch(/LibreOffice/)
    expect(text).toMatch(/Tesseract/)
  })
})
