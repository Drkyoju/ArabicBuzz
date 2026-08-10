import { afterEach, describe, expect, it } from 'vitest'
import {
  mistralOcrConfigured,
  paddleOcrConfigured,
} from '@/lib/rag/ocr'
import {
  brokenToUnicodeErrorAr,
  CONVERT_OCR_REFUSE_AR,
} from '@/lib/documents/arabic-text-quality'

describe('convert OCR cascade config', () => {
  const keys = [
    'MISTRAL_API_KEY',
    'CONVERT_ALLOW_MISTRAL',
    'PADDLE_OCR_URL',
    'ENABLE_PADDLE_OCR',
    'INSTALL_PADDLE_OCR',
    'AIRGAP_MODE',
  ] as const
  const prev: Record<string, string | undefined> = {}

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
      delete prev[k]
    }
  })

  function snap(k: string) {
    if (!(k in prev)) prev[k] = process.env[k]
  }

  it('treats Paddle as configured via URL without inventing keys', () => {
    snap('PADDLE_OCR_URL')
    snap('ENABLE_PADDLE_OCR')
    snap('MISTRAL_API_KEY')
    snap('CONVERT_ALLOW_MISTRAL')
    process.env.PADDLE_OCR_URL = 'https://paddle.example'
    delete process.env.ENABLE_PADDLE_OCR
    delete process.env.MISTRAL_API_KEY
    delete process.env.CONVERT_ALLOW_MISTRAL
    expect(paddleOcrConfigured()).toBe(true)
    expect(mistralOcrConfigured()).toBe(false)
  })

  it('treats Paddle as configured via ENABLE_PADDLE_OCR=1', () => {
    snap('PADDLE_OCR_URL')
    snap('ENABLE_PADDLE_OCR')
    delete process.env.PADDLE_OCR_URL
    process.env.ENABLE_PADDLE_OCR = '1'
    expect(paddleOcrConfigured()).toBe(true)
  })

  it('does not auto-enable Mistral with key alone (needs CONVERT_ALLOW_MISTRAL=1)', () => {
    snap('MISTRAL_API_KEY')
    snap('CONVERT_ALLOW_MISTRAL')
    snap('AIRGAP_MODE')
    process.env.MISTRAL_API_KEY = 'sk-test'
    delete process.env.CONVERT_ALLOW_MISTRAL
    delete process.env.AIRGAP_MODE
    expect(mistralOcrConfigured()).toBe(false)
  })

  it('enables Mistral only when CONVERT_ALLOW_MISTRAL=1 and key present', () => {
    snap('MISTRAL_API_KEY')
    snap('CONVERT_ALLOW_MISTRAL')
    snap('AIRGAP_MODE')
    process.env.MISTRAL_API_KEY = 'sk-test'
    process.env.CONVERT_ALLOW_MISTRAL = '1'
    delete process.env.AIRGAP_MODE
    expect(mistralOcrConfigured()).toBe(true)
  })

  it('Arabic refuse message stays user-facing MSA (no engine dump)', () => {
    const msg = brokenToUnicodeErrorAr({
      hasPaddle: false,
      hasMistral: false,
      hasGoogleHint: true,
    })
    expect(msg).toContain(CONVERT_OCR_REFUSE_AR)
    expect(msg).toMatch(/طلاسم|OCR|Drive/)
    expect(msg).not.toMatch(/ToUnicode|CONVERT_ALLOW_MISTRAL|Gemini Flash|PaddleOCR/)
  })
})
