import { describe, expect, it } from 'vitest'
import {
  compressTelegramReplyAr,
  looksLikeDumbClarifyAsk,
  parseTelegramShortIntent,
  shortIntentToWorkKind,
} from '@/lib/telegram/short-intent'
import { classifyTelegramWorkIntent } from '@/lib/telegram/power-path'
import {
  formatUnknownShortAr,
  looksLikeDumbGroupClarify,
} from '@/lib/telegram/group-reply-policy'

describe('parseTelegramShortIntent', () => {
  it('parses web / maps / brief / archive', () => {
    expect(parseTelegramShortIntent('ابحث في جوجل عن رؤية 2030')?.kind).toBe(
      'web_search'
    )
    expect(parseTelegramShortIntent('أين تقع برج المملكة')?.kind).toBe('maps')
    expect(parseTelegramShortIntent('خريطة الرياض')?.payload).toMatch(/الرياض/)
    expect(parseTelegramShortIntent('إحاطة الصباح')?.kind).toBe('brief')
    expect(parseTelegramShortIntent('أرشف المجموعة')?.kind).toBe('archive')
  })

  it('parses mail / calendar book / task / create / mesh', () => {
    expect(parseTelegramShortIntent('ابحث في البريد عن الفاتورة')?.kind).toBe(
      'mail'
    )
    expect(parseTelegramShortIntent('وش في البريد؟')?.kind).toBe('mail')
    expect(parseTelegramShortIntent('احجز موعد غداً ١٠ص')?.kind).toBe(
      'calendar_book'
    )
    expect(parseTelegramShortIntent('أضف مهمة متابعة التقرير')?.kind).toBe(
      'task'
    )
    expect(parseTelegramShortIntent('أنشئ ملف مذكرة بالعنوان')?.kind).toBe(
      'create_file'
    )
    expect(parseTelegramShortIntent('دور في الشبكة عن اللائحة')?.kind).toBe(
      'mesh'
    )
    expect(parseTelegramShortIntent('وين الملف')?.kind).toBe('mesh')
  })

  it('parses wiki / math / ocr / notify', () => {
    expect(parseTelegramShortIntent('ويكيبيديا الذكاء الاصطناعي')?.kind).toBe(
      'wiki'
    )
    expect(parseTelegramShortIntent('احسب 12*8')?.kind).toBe('math')
    expect(parseTelegramShortIntent('OCR')?.kind).toBe('ocr')
    expect(parseTelegramShortIntent('أرسل لأحمد: الاجتماع غداً')?.kind).toBe(
      'notify'
    )
  })

  it('returns null for social / empty / too long', () => {
    expect(parseTelegramShortIntent('كيفك')).toBeNull()
    expect(parseTelegramShortIntent('')).toBeNull()
    expect(parseTelegramShortIntent('أ'.repeat(300))).toBeNull()
  })

  it('maps kinds to work kinds without breaking calendar fast-path', () => {
    expect(shortIntentToWorkKind('calendar_list')).toBe('question')
    expect(shortIntentToWorkKind('calendar_book')).toBe('appointment')
    expect(shortIntentToWorkKind('create_file')).toBe('file')
    expect(shortIntentToWorkKind('web_search')).toBe('question')
  })
})

describe('classifyTelegramWorkIntent + short intents', () => {
  it('prefers short-intent labels for shortcuts', () => {
    expect(classifyTelegramWorkIntent('إحاطة الصباح').labelAr).toBe(
      'إحاطة صباح'
    )
    expect(classifyTelegramWorkIntent('ابحث في جوجل عن نيوم').labelAr).toBe(
      'بحث ويب'
    )
    expect(classifyTelegramWorkIntent('أين تقع الدرعية').labelAr).toBe(
      'موقع / خريطة'
    )
    expect(classifyTelegramWorkIntent('وش في البريد؟').kind).toBe('mail')
    expect(classifyTelegramWorkIntent('أرشف المجموعة').kind).toBe('file')
  })
})

describe('compressTelegramReplyAr / dumb clarify', () => {
  it('detects dumb clarify asks', () => {
    expect(looksLikeDumbClarifyAsk('هل تريد أن أوضح أكثر؟')).toBe(true)
    expect(looksLikeDumbClarifyAsk('ماذا تقصد بالضبط؟')).toBe(true)
    expect(looksLikeDumbClarifyAsk('تم إنشاء الموعد بنجاح الساعة ١٠')).toBe(
      false
    )
  })

  it('compresses verbose / dumb replies', () => {
    expect(compressTelegramReplyAr('بالتأكيد! تم الحجز.')).toBe('تم الحجز.')
    expect(compressTelegramReplyAr('هل تريد المساعدة؟')).toMatch(/أعد|اختصار/)
  })

  it('group policy maps dumb clarify to short MSA', () => {
    expect(looksLikeDumbGroupClarify('هل تود أن أوضح المطلوب؟')).toBe(true)
    expect(formatUnknownShortAr('هل تريد المزيد من التفاصيل؟')).toMatch(
      /أعد الطلب/
    )
  })
})
