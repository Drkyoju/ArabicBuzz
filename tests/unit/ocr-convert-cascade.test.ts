import { afterEach, describe, expect, it } from 'vitest'
import {
  mistralOcrConfigured,
  paddleOcrConfigured,
} from '@/lib/rag/ocr'
import { brokenToUnicodeErrorAr } from '@/lib/documents/arabic-text-quality'

describe('convert OCR cascade config', () => {
  const keys = [
    'MISTRAL_API_KEY',
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
    process.env.PADDLE_OCR_URL = 'https://paddle.example'
    delete process.env.ENABLE_PADDLE_OCR
    delete process.env.MISTRAL_API_KEY
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

  it('Arabic refuse message prefers Paddle before Mistral and states cost honesty', () => {
    const msg = brokenToUnicodeErrorAr({
      hasPaddle: false,
      hasMistral: false,
    })
    expect(msg).toContain('PaddleOCR')
    expect(msg).toContain('أرخص من Mistral')
    expect(msg).toContain('الجودة ليست دائماً أقوى')
    expect(msg).toMatch(/Flash|Gemini Flash/)
    expect(msg.indexOf('PaddleOCR')).toBeLessThan(msg.indexOf('Mistral إن'))
  })
})
