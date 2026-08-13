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
import {
  looksLikeDumbFileRefusalAr,
  TELEGRAM_FILE_GOLDEN_RULE_AR,
  FILE_SOURCE_POLICY_AR,
} from '@/lib/files/file-source-policy'
import {
  capabilityCascadePromptNudgeAr,
  TELEGRAM_CAPABILITY_CASCADE_SYSTEM_AR,
} from '@/lib/telegram/capability-cascade'
import { TELEGRAM_LIMITS_SYSTEM_AR } from '@/lib/telegram/power-path'

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

  it('parses archive search and mail draft (HITL path)', () => {
    expect(parseTelegramShortIntent('ابحث في الأرشيف عن اللائحة')?.kind).toBe(
      'archive_search'
    )
    expect(parseTelegramShortIntent('دور عن محضر اللجنة')?.kind).toBe(
      'archive_search'
    )
    expect(parseTelegramShortIntent('ابحث عن رؤية 2030')?.kind).toBe(
      'web_search'
    )
    expect(parseTelegramShortIntent('اكتب رد على البريد')?.kind).toBe(
      'mail_draft'
    )
    expect(parseTelegramShortIntent('مسودة رد')?.kind).toBe('mail_draft')
    expect(shortIntentToWorkKind('archive_search')).toBe('file')
    expect(shortIntentToWorkKind('mail_draft')).toBe('mail')
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

  it('parses association bare shortcuts محضر · خطاب · موعد · بريد · حوّل · لخّص', () => {
    expect(parseTelegramShortIntent('محضر')?.kind).toBe('minutes')
    expect(parseTelegramShortIntent('خطاب')?.kind).toBe('letter')
    expect(parseTelegramShortIntent('موعد')?.kind).toBe('calendar_list')
    expect(parseTelegramShortIntent('بريد')?.kind).toBe('mail')
    expect(parseTelegramShortIntent('حوّل')?.kind).toBe('edit_file')
    expect(parseTelegramShortIntent('لخّص')?.kind).toBe('edit_file')
    expect(parseTelegramShortIntent('محضر اجتماع اللجنة')?.kind).toBe('minutes')
    expect(shortIntentToWorkKind('minutes')).toBe('file')
    expect(shortIntentToWorkKind('letter')).toBe('file')
  })

  it('parses Gulf/MSA variants: ذكّرني · وريني المواعيد · ابحث عن · ايميلنا · هجري', () => {
    expect(parseTelegramShortIntent('ذكّرني بمتابعة التقرير غداً')?.kind).toBe(
      'reminder'
    )
    expect(parseTelegramShortIntent('ذكرني بالاجتماع')?.kind).toBe('reminder')
    expect(shortIntentToWorkKind('reminder')).toBe('task')
    expect(parseTelegramShortIntent('وريني المواعيد')?.kind).toBe(
      'calendar_list'
    )
    expect(parseTelegramShortIntent('أبي موعد غداً ١٠ص')?.kind).toBe(
      'calendar_book'
    )
    expect(parseTelegramShortIntent('ابحث عن رؤية 2030')?.kind).toBe(
      'web_search'
    )
    expect(parseTelegramShortIntent('ايميلنا')?.kind).toBe('mail')
    expect(parseTelegramShortIntent('كم التاريخ الهجري؟')?.kind).toBe(
      'datetime'
    )
    expect(
      parseTelegramShortIntent('أرشيف الويب https://www.vision2030.gov.sa')
        ?.kind
    ).toBe('wayback')
  })

  it('does not steal room/mail queries into soft web search', () => {
    expect(parseTelegramShortIntent('ابحث في الغرفة عن اللائحة')?.kind).toBe(
      'room_search'
    )
    expect(parseTelegramShortIntent('ابحث في البريد عن الفاتورة')?.kind).toBe(
      'mail'
    )
  })

  it('calendar list nudge names team agenda not personal Google', () => {
    const n = parseTelegramShortIntent('كم موعد عندنا؟')
    expect(n?.nudgeAr).toMatch(/مواعيد الجمعية\/الفريق/)
    expect(n?.nudgeAr).toMatch(/تقويمك الشخصي/)
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

describe('golden rule — brand-new attachment is working copy', () => {
  it('exports golden rule and prefers attachment over Drive-first', () => {
    expect(TELEGRAM_FILE_GOLDEN_RULE_AR).toMatch(/مرفق جديد/)
    expect(TELEGRAM_FILE_GOLDEN_RULE_AR).toMatch(/لا تشترط Drive/)
    expect(FILE_SOURCE_POLICY_AR).toMatch(/مرآة مرفقات تيليجرام/)
    expect(TELEGRAM_CAPABILITY_CASCADE_SYSTEM_AR).toMatch(/قاعدة ذهبية/)
    expect(TELEGRAM_LIMITS_SYSTEM_AR).toMatch(/قاعدة ذهبية/)
    expect(capabilityCascadePromptNudgeAr('لخّص الملف')).toMatch(/مرفق جديد|قاعدة ذهبية/)
  })

  it('bans Drive-only / lost / resend refusals', () => {
    expect(looksLikeDumbFileRefusalAr('الملف مو بالدرايف')).toBe(true)
    expect(looksLikeDumbFileRefusalAr('مو موجود في الدرايف')).toBe(true)
    expect(looksLikeDumbFileRefusalAr('ما أعرف وين الملف')).toBe(true)
    expect(looksLikeDumbFileRefusalAr('أعد الإرسال من فضلك')).toBe(true)
    expect(looksLikeDumbFileRefusalAr('تم إرسال المرفق بنجاح')).toBe(false)
  })

  it('compresses Drive refusals to execute nudge', () => {
    expect(compressTelegramReplyAr('الملف مو بالدرايف')).toMatch(/نسخة العمل|return_file/)
    expect(formatUnknownShortAr('ما أعرف وين')).toMatch(/نسخة العمل|لا تشترط/)
  })

  it('edit short-intent nudges golden rule', () => {
    const edit = parseTelegramShortIntent('عدّل الملف')
    expect(edit?.kind).toBe('edit_file')
    expect(edit?.nudgeAr).toMatch(/قاعدة ذهبية|أول مرة/)
    expect(edit?.nudgeAr).toMatch(/return_file/)
  })
})
