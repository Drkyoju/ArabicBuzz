import { describe, expect, it } from 'vitest'
import {
  looksLikeTelegramMessaging,
  parseTelegramMessageIntent,
} from '@/lib/telegram/message-intent'
import { classifyTelegramWorkIntent } from '@/lib/telegram/power-path'
import { formatTelegramErrorAr } from '@/lib/telegram/errors-ar'
import {
  buildTelegramHelpAr,
  TELEGRAM_PING_OK_AR,
  TELEGRAM_SITE_URL,
} from '@/lib/telegram/help-copy'
import {
  __resetTelegramUpdateDedupeForTests,
  claimTelegramUpdate,
} from '@/lib/telegram/update-dedupe'

describe('parseTelegramMessageIntent', () => {
  it('parses DM with colon', () => {
    const r = parseTelegramMessageIntent('أرسل لأحمد: الاجتماع غداً الساعة ١٠')
    expect(r?.kind).toBe('dm')
    if (r?.kind === 'dm') {
      expect(r.targetNameAr).toBe('أحمد')
      expect(r.bodyAr).toContain('الاجتماع')
    }
  })

  it('parses broadcast to group', () => {
    const r = parseTelegramMessageIntent('بلّغ المجموعة: تأجيل اجتماع اللجنة')
    expect(r?.kind).toBe('broadcast')
    if (r?.kind === 'broadcast') {
      expect(r.bodyAr).toContain('تأجيل')
    }
  })

  it('parses coordination', () => {
    const r = parseTelegramMessageIntent('نسّق مع سارة: راجع مسودة المحضر')
    expect(r?.kind).toBe('dm')
    if (r?.kind === 'dm') {
      expect(r.targetNameAr).toBe('سارة')
      expect(r.labelAr).toMatch(/تنسيق/)
    }
  })

  it('detects messaging heuristic', () => {
    expect(looksLikeTelegramMessaging('أرسل لمحمد موعد الغد')).toBe(true)
    expect(looksLikeTelegramMessaging('كم موعد عندنا؟')).toBe(false)
  })
})

describe('classifyTelegramWorkIntent', () => {
  it('classifies appointment / task / file / wake', () => {
    expect(classifyTelegramWorkIntent('احجز موعد غداً ١٠ص').kind).toBe(
      'appointment'
    )
    expect(classifyTelegramWorkIntent('أضف مهمة متابعة التقرير').kind).toBe(
      'task'
    )
    expect(classifyTelegramWorkIntent('حوّل الملف إلى Word').kind).toBe('file')
    expect(classifyTelegramWorkIntent('أيقظ الوكيل ولخّص القرارات').kind).toBe(
      'question'
    )
    expect(classifyTelegramWorkIntent('السلام عليكم').kind).toBe('casual')
  })

  it('prefers messaging over appointment when notifying', () => {
    expect(
      classifyTelegramWorkIntent('أرسل لأحمد: موعد الغد ملغى').kind
    ).toBe('message')
  })
})

describe('formatTelegramErrorAr', () => {
  it('maps link / drive / timeout / blocked', () => {
    expect(formatTelegramErrorAr('not linked')).toMatch(/غير مربوط|\/link/)
    expect(formatTelegramErrorAr(new Error('invalid_grant'))).toMatch(/Google/)
    expect(formatTelegramErrorAr(new Error('ETIMEDOUT'))).toMatch(/مهلة/)
    expect(formatTelegramErrorAr(new Error('bot was blocked'))).toMatch(/Start/)
  })
})

describe('help copy', () => {
  it('covers wake, site URL, and ping constant', () => {
    const help = buildTelegramHelpAr({ botUsername: 'alhuda14bot' })
    expect(help).toContain(TELEGRAM_SITE_URL)
    expect(help).toContain('/link@alhuda14bot')
    expect(help).toMatch(/وكيل١/)
    expect(help).toContain('/ping')
    expect(TELEGRAM_PING_OK_AR).toMatch(/يعمل/)
  })
})

describe('claimTelegramUpdate', () => {
  it('dedupes same update id in memory', async () => {
    __resetTelegramUpdateDedupeForTests()
    expect(await claimTelegramUpdate(42_001)).toBe(true)
    expect(await claimTelegramUpdate(42_001)).toBe(false)
    expect(await claimTelegramUpdate(42_002)).toBe(true)
  })
})
