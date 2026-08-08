import { describe, expect, it } from 'vitest'
import { shouldDeliverSilentAttachment } from '@/lib/telegram/attachment-deliver'

describe('shouldDeliverSilentAttachment', () => {
  it('delivers edit/return tools always', () => {
    expect(
      shouldDeliverSilentAttachment({
        toolName: 'return_file',
        workKind: 'question',
      })
    ).toBe(true)
    expect(
      shouldDeliverSilentAttachment({
        toolName: 'edit_document',
        workKind: 'casual',
      })
    ).toBe(true)
    expect(
      shouldDeliverSilentAttachment({
        toolName: 'brain_save_document',
        workKind: 'file',
      })
    ).toBe(true)
  })

  it('delivers brain_open on file turns', () => {
    expect(
      shouldDeliverSilentAttachment({
        toolName: 'brain_open_document',
        workKind: 'file',
      })
    ).toBe(true)
  })

  it('skips brain_open on summary unless explicit send', () => {
    expect(
      shouldDeliverSilentAttachment({
        toolName: 'brain_open_document',
        workKind: 'question',
        prompt: 'لخّص قرارات اللجنة من الملف',
      })
    ).toBe(false)
    expect(
      shouldDeliverSilentAttachment({
        toolName: 'brain_open_document',
        workKind: 'question',
        prompt: 'جيب لي ملف اللائحة',
      })
    ).toBe(true)
  })

  it('delivers assistant attachments without toolName on file ask', () => {
    expect(
      shouldDeliverSilentAttachment({
        workKind: 'file',
        prompt: 'أبغا اللائحة',
      })
    ).toBe(true)
    expect(
      shouldDeliverSilentAttachment({
        workKind: 'appointment',
        prompt: 'احجز موعد غداً',
      })
    ).toBe(false)
  })
})
