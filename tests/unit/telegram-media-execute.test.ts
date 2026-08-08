import { describe, expect, it } from 'vitest'
import {
  assertCaptionWorkMustExecute,
  decideTelegramMediaExecute,
  decideTelegramVoiceOrTextExecute,
} from '@/lib/telegram/media-execute-policy'
import {
  clearTelegramRecentMediaForTests,
  formatRecentTelegramMediaHint,
  getLatestTelegramMedia,
  rememberTelegramMedia,
} from '@/lib/telegram/recent-media'
import { classifyTelegramWorkIntent } from '@/lib/telegram/power-path'

describe('decideTelegramMediaExecute', () => {
  it('any caption in group → execute (never archive-only)', () => {
    const d = decideTelegramMediaExecute({
      captionOrText: 'نسّق الملف حوّله إلى Word',
      inGroup: true,
      mentioned: false,
      isReplyToBot: false,
    })
    expect(d.shouldExecute).toBe(true)
    expect(d.workKind).not.toBe('casual')
  })

  it('greeting caption still executes as file work', () => {
    const d = decideTelegramMediaExecute({
      captionOrText: 'شكرا',
      inGroup: true,
      mentioned: false,
      isReplyToBot: false,
    })
    expect(d.shouldExecute).toBe(true)
    expect(d.workKind).toBe('file')
  })

  it('bare upload in group without caption → archive only', () => {
    const d = decideTelegramMediaExecute({
      captionOrText: '',
      inGroup: true,
      mentioned: false,
      isReplyToBot: false,
    })
    expect(d.shouldExecute).toBe(false)
    expect(d.workKind).toBe('casual')
  })

  it('bare upload in DM → execute', () => {
    const d = decideTelegramMediaExecute({
      captionOrText: '',
      inGroup: false,
      mentioned: false,
      isReplyToBot: false,
    })
    expect(d.shouldExecute).toBe(true)
  })

  it('assertCaptionWorkMustExecute throws if caption but not execute', () => {
    expect(() => assertCaptionWorkMustExecute('حوّل', false)).toThrow(
      /must execute/
    )
    expect(() => assertCaptionWorkMustExecute('حوّل', true)).not.toThrow()
    expect(() => assertCaptionWorkMustExecute('', false)).not.toThrow()
  })
})

describe('decideTelegramVoiceOrTextExecute', () => {
  it('file work voice without mention → execute', () => {
    const d = decideTelegramVoiceOrTextExecute({
      transcriptOrText: 'حوّل الملف إلى وورد',
      inGroup: true,
      mentioned: false,
      isReplyToBot: false,
    })
    expect(d.shouldExecute).toBe(true)
    expect(d.workKind).toBe('file')
  })

  it('تنسيق / نظم classify as file', () => {
    expect(classifyTelegramWorkIntent('نسّق المعلم الاول').kind).toBe('file')
    expect(classifyTelegramWorkIntent('نظّم الملف').kind).toBe('file')
  })

  it('casual chat stays silent', () => {
    const d = decideTelegramVoiceOrTextExecute({
      transcriptOrText: 'السلام عليكم',
      inGroup: true,
      mentioned: false,
      isReplyToBot: false,
    })
    expect(d.shouldExecute).toBe(false)
    expect(d.workKind).toBe('casual')
  })
})

describe('recent telegram media', () => {
  it('remembers and formats working-copy hint without Drive', () => {
    clearTelegramRecentMediaForTests()
    rememberTelegramMedia('-1001', {
      fileId: 'wf-1',
      name: 'المعلم الاول.pdf',
      mimeType: 'application/pdf',
      scopeId: 'shared-demo',
    })
    const latest = getLatestTelegramMedia('-1001')
    expect(latest?.name).toContain('المعلم')
    const hint = formatRecentTelegramMediaHint('-1001')
    expect(hint).toMatch(/نسخة العمل/)
    expect(hint).toMatch(/wf-1/)
    expect(hint).toMatch(/لا تنتظر Google Drive/)
  })
})
