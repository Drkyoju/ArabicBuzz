import { describe, expect, it } from 'vitest'
import { getDeepHistoryStatus } from '@/lib/telegram/history-scan'

describe('deep history recovery status', () => {
  it('documents bot API history limit and setup without chat spam', () => {
    const s = getDeepHistoryStatus()
    expect(s.limitationAr).toMatch(/لا يقرأ تاريخ|MTProto/)
    expect(s.setupAr).toMatch(/my\.telegram\.org|mtproto-login/)
    expect(s.setupAr).not.toMatch(/أعد إرسال/)
    expect(s.freePathAr).toMatch(/Bot API|الماك|Local|غرفة|Drive/)
  })

  it('treats Mac hop as potential credential path without CranL session', () => {
    const prev = process.env.MAC_SYNC_URL
    process.env.MAC_SYNC_URL = 'https://example-mac-tunnel.test'
    delete process.env.TELEGRAM_SESSION_STRING
    delete process.env.TELEGRAM_SESSION
    const s = getDeepHistoryStatus()
    expect(s.macHopConfigured).toBe(true)
    // Sync flag may be true when hop configured; live probe confirms session on Mac
    expect(s.credentialsReady).toBe(true)
    process.env.MAC_SYNC_URL = prev
  })
})
