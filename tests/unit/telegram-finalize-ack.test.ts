import { describe, expect, it } from 'vitest'
import {
  decideFinalizeAckFallback,
  isTelegramMessageNotModifiedError,
  shouldSkipDuplicateFinalizeReply,
} from '@/lib/telegram/finalize-ack'

describe('isTelegramMessageNotModifiedError', () => {
  it('detects Telegram not-modified errors', () => {
    expect(
      isTelegramMessageNotModifiedError(
        new Error('Bad Request: message is not modified')
      )
    ).toBe(true)
    expect(
      isTelegramMessageNotModifiedError({
        description: 'Bad Request: message is not modified',
      })
    ).toBe(true)
    expect(isTelegramMessageNotModifiedError(new Error('timeout'))).toBe(false)
  })
})

describe('shouldSkipDuplicateFinalizeReply — group spam failure mode', () => {
  it('skips when stream already displayed the same final text', () => {
    const text = 'تم حجز الموعد غداً الساعة ١٠.'
    expect(
      shouldSkipDuplicateFinalizeReply({
        finalText: text,
        alreadyDisplayedText: text,
      })
    ).toBe(true)
  })

  it('skips on message-is-not-modified (old bug: fell through to ctx.reply)', () => {
    expect(
      shouldSkipDuplicateFinalizeReply({
        finalText: 'نفس الرد',
        alreadyDisplayedText: 'نفس الرد',
        editError: new Error('400: Bad Request: message is not modified'),
      })
    ).toBe(true)
    expect(
      decideFinalizeAckFallback({
        finalText: 'نفس الرد',
        alreadyDisplayedText: 'نفس الرد',
        editError: new Error('message is not modified'),
      })
    ).toBe('already')
  })

  it('skips second copy when stream showed an answer even if edit fails', () => {
    expect(
      shouldSkipDuplicateFinalizeReply({
        finalText: 'رد مضغوط أقصر',
        alreadyDisplayedText: 'رد أطول أثناء البث… تفاصيل زائدة',
        editError: new Error('network reset'),
      })
    ).toBe(true)
    expect(
      decideFinalizeAckFallback({
        finalText: 'رد مضغوط أقصر',
        alreadyDisplayedText: 'رد أطول أثناء البث… تفاصيل زائدة',
        editError: new Error('network reset'),
      })
    ).toBe('left_ack')
  })

  it('NUCLEAR: never reply fallback when ack already posted (even if still جاري…)', () => {
    expect(
      shouldSkipDuplicateFinalizeReply({
        finalText: 'النتيجة النهائية',
        alreadyDisplayedText: 'جاري…',
        editError: new Error("can't parse entities"),
        ackAlreadyPosted: true,
      })
    ).toBe(true)
    expect(
      decideFinalizeAckFallback({
        finalText: 'النتيجة النهائية',
        alreadyDisplayedText: 'جاري…',
        editError: new Error("can't parse entities"),
        ackAlreadyPosted: true,
      })
    ).toBe('left_ack')
  })

  it('legacy path without ackAlreadyPosted may still reply when only جاري…', () => {
    expect(
      shouldSkipDuplicateFinalizeReply({
        finalText: 'النتيجة النهائية',
        alreadyDisplayedText: 'جاري…',
        editError: new Error("can't parse entities"),
      })
    ).toBe(false)
    expect(
      decideFinalizeAckFallback({
        finalText: 'النتيجة النهائية',
        alreadyDisplayedText: 'جاري…',
        editError: new Error("can't parse entities"),
      })
    ).toBe('reply')
  })

  it('allows reply when nothing was displayed yet and no ack posted', () => {
    expect(
      decideFinalizeAckFallback({
        finalText: 'أول رد',
        alreadyDisplayedText: '',
        editError: new Error('message to edit not found'),
      })
    ).toBe('reply')
  })
})
