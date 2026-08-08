import { describe, expect, it } from 'vitest'
import { getDeepHistoryStatus } from '@/lib/telegram/history-scan'

describe('deep history recovery status', () => {
  it('documents bot API history limit and setup without chat spam', () => {
    const s = getDeepHistoryStatus()
    expect(s.limitationAr).toMatch(/لا يقرأ تاريخ|MTProto/)
    expect(s.setupAr).toMatch(/my\.telegram\.org|mtproto-login/)
    expect(s.setupAr).not.toMatch(/أعد إرسال/)
    expect(s.freePathAr).toMatch(/Bot API محلي|الماك/)
  })
})
