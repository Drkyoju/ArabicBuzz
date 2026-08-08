import { describe, expect, it } from 'vitest'
import {
  formatUnknownShortAr,
  looksLikeBlockedTaskReply,
  looksLikeUnknownOrNotFound,
  resolveGroupReplyMode,
} from '@/lib/telegram/group-reply-policy'
import { formatBlockedTaskReplyAr } from '@/lib/agents/tools/research-task-tools'

describe('resolveGroupReplyMode', () => {
  it('DM is always full', () => {
    expect(
      resolveGroupReplyMode({
        inGroup: false,
        mentioned: false,
        isReplyToBot: false,
      })
    ).toBe('full')
  })

  it('group actionable work without mention → full', () => {
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: false,
        workKind: 'file',
      })
    ).toBe('full')
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: false,
        workKind: 'question',
      })
    ).toBe('full')
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: false,
        workKind: 'appointment',
      })
    ).toBe('full')
  })

  it('group casual without mention → silent watch', () => {
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: false,
        workKind: 'casual',
      })
    ).toBe('silent_execute')
  })

  it('group @mention / reply / command → full even if casual', () => {
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: true,
        isReplyToBot: false,
        workKind: 'casual',
      })
    ).toBe('full')
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: true,
        workKind: 'casual',
      })
    ).toBe('full')
    expect(
      resolveGroupReplyMode({
        inGroup: true,
        mentioned: false,
        isReplyToBot: false,
        isCommand: true,
        workKind: 'casual',
      })
    ).toBe('full')
  })
})

describe('looksLikeUnknownOrNotFound', () => {
  it('empty stays silent (not unknown)', () => {
    expect(looksLikeUnknownOrNotFound('')).toBe(false)
    expect(looksLikeUnknownOrNotFound('   ')).toBe(false)
  })

  it('detects Arabic unknown / not-found', () => {
    expect(looksLikeUnknownOrNotFound('ما عرفت كذا')).toBe(true)
    expect(looksLikeUnknownOrNotFound('ما حصلت هذا الملف')).toBe(true)
    expect(looksLikeUnknownOrNotFound('تم إنشاء الموعد بنجاح')).toBe(false)
  })

  it('detects blocked-task research template', () => {
    const blocked = formatBlockedTaskReplyAr({
      suggestions: [],
      researched: true,
    })
    expect(looksLikeBlockedTaskReply(blocked)).toBe(true)
    expect(looksLikeUnknownOrNotFound(blocked)).toBe(true)
  })
})

describe('formatUnknownShortAr', () => {
  it('maps to short stock lines', () => {
    expect(formatUnknownShortAr('ما عرفت الموعد')).toBe('ما عرفت كذا.')
    expect(formatUnknownShortAr('الملف غير موجود')).toBe('ما حصلت هذا.')
    expect(formatUnknownShortAr('')).toBe('ما عرفت كذا.')
  })

  it('keeps fuller blocked-task MSA reply', () => {
    const blocked = formatBlockedTaskReplyAr({
      suggestions: [
        {
          title: 'Free MCP Example',
          url: 'https://github.com/example/mcp',
          snippet: 'open source',
          costRank: 0,
          costLabelAr: 'مجاني / مفتوح المصدر (مفضّل)',
          kind: 'mcp',
        },
      ],
      researched: true,
    })
    expect(formatUnknownShortAr(blocked)).toContain('تعذّر تنفيذ المهمة')
    expect(formatUnknownShortAr(blocked)).toContain('أقترح (من الأرخص)')
    expect(formatUnknownShortAr(blocked)).toContain(
      'إن وفّرت مفتاح/تثبيت أحدها أقدر أكمّل.'
    )
  })
})

describe('formatBlockedTaskReplyAr', () => {
  it('uses the product MSA template', () => {
    const msg = formatBlockedTaskReplyAr({
      suggestions: [],
      researched: true,
    })
    expect(msg).toMatch(/^تعذّر تنفيذ المهمة بالأدوات الحالية\./)
    expect(msg).toContain('بحثت عن حلول')
    expect(msg).toContain('أقترح (من الأرخص)')
    expect(msg).toContain('إن وفّرت مفتاح/تثبيت أحدها أقدر أكمّل.')
  })
})
