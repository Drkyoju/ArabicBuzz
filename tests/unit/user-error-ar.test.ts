import { describe, expect, it } from 'vitest'
import {
  mapChatErrorAr,
  mapToolErrorAr,
  toolLabelAr,
  unknownModelMessageAr,
} from '@/lib/ai/user-error-ar'

describe('mapChatErrorAr', () => {
  it('maps unknown model English to Arabic', () => {
    expect(mapChatErrorAr('Unknown model id: foo-bar')).toMatch(/النموذج/)
  })

  it('maps rate limits', () => {
    expect(mapChatErrorAr('Rate limit exceeded')).toMatch(/حد الطلبات/)
  })

  it('maps timeout without أعد الإرسال', () => {
    expect(mapChatErrorAr('Request timed out')).toMatch(/مهلة/)
    expect(mapChatErrorAr('Request timed out')).not.toMatch(/أعد الإرسال/)
  })

  it('keeps Arabic errors', () => {
    expect(mapChatErrorAr('تعذّر ربط المحادثة')).toBe('تعذّر ربط المحادثة')
  })

  it('uses AUTH_REQUIRED code', () => {
    expect(mapChatErrorAr('whatever', { code: 'AUTH_REQUIRED' })).toMatch(
      /سجّل الدخول/
    )
  })

  it('unknownModelMessageAr includes id', () => {
    expect(unknownModelMessageAr('x-1')).toContain('x-1')
  })

  it('maps ToUnicode English noise', () => {
    expect(mapChatErrorAr('Broken ToUnicode layer in PDF')).toMatch(/عربي|ترميز/)
  })
})

describe('mapToolErrorAr / toolLabelAr', () => {
  it('maps extract_source style dumps', () => {
    expect(mapToolErrorAr('extract_source_fixed failed')).toMatch(/تحويل|استخراج/)
    expect(mapToolErrorAr('extract_source_fixed failed')).not.toMatch(
      /extract_source/
    )
  })

  it('never dumps raw snake_case tool names as labels', () => {
    expect(toolLabelAr('convert_document')).toBe('تحويل صيغة الملف')
    expect(toolLabelAr('some_unknown_tool_xyz')).toBe('إجراء تقني')
    expect(toolLabelAr('some_unknown_tool_xyz')).not.toMatch(/_/)
  })
})
