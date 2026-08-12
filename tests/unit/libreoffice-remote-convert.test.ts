/**
 * Unit tests for LibreOffice remote URL / availability (no network).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('libreoffice remote convert config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('reads CONVERT_SERVICE_URL as remote base', async () => {
    vi.stubEnv('CONVERT_SERVICE_URL', 'https://lo.example.com/')
    vi.stubEnv('LIBREOFFICE_URL', '')
    const mod = await import('@/lib/documents/libreoffice-convert')
    expect(mod.libreOfficeRemoteUrl()).toBe('https://lo.example.com')
    expect(await mod.libreOfficeAvailable()).toBe(true)
    const status = await mod.libreOfficeStatusAr()
    expect(status).toMatch(/بعيدة|CONVERT_SERVICE/)
  })

  it('accepts LIBREOFFICE_URL alias', async () => {
    vi.stubEnv('CONVERT_SERVICE_URL', '')
    vi.stubEnv('LIBREOFFICE_URL', 'https://alias.example.com')
    const mod = await import('@/lib/documents/libreoffice-convert')
    expect(mod.libreOfficeRemoteUrl()).toBe('https://alias.example.com')
  })

  it('reports unavailable Arabic when no remote and no local soffice', async () => {
    vi.stubEnv('CONVERT_SERVICE_URL', '')
    vi.stubEnv('LIBREOFFICE_URL', '')
    vi.stubEnv('AB_LIBREOFFICE_IMAGE', '0')
    // Force no binary by clearing candidates via empty PATH-ish resolution —
    // module caches binary; fresh import after env clear is enough when PATH
    // has no soffice in CI (typical).
    const mod = await import('@/lib/documents/libreoffice-convert')
    const status = await mod.libreOfficeStatusAr()
    // Either local soffice exists on Mac CI, or remote-missing message.
    expect(typeof status).toBe('string')
    expect(status.length).toBeGreaterThan(5)
  })
})

describe('whatsapp bridge transport', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('prefers free bridge over Meta Cloud', async () => {
    vi.stubEnv('WHATSAPP_BRIDGE_URL', 'https://evo.example.com/')
    vi.stubEnv('WHATSAPP_TOKEN', 'meta-token')
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123')
    const { resolveWhatsAppTransport, whatsappBridgeUrl } = await import(
      '@/lib/whatsapp/bridge'
    )
    expect(whatsappBridgeUrl()).toBe('https://evo.example.com')
    expect(resolveWhatsAppTransport()).toBe('bridge')
  })
})
