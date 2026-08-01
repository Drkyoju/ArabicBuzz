export const IS_AIR_GAPPED_MODE = process.env.AIR_GAPPED_MODE === 'true'

const AIRGAP_ERROR =
  'عفواً، النظام يعمل حالياً في الوضع المحلي المغلق (Air-Gapped Mode) ولا يسمح بالاتصال بالخدمات الخارجية.'

export function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true
  if (host.startsWith('10.')) return true
  if (host.startsWith('192.168.')) return true
  if (host.startsWith('169.254.')) return true
  const m = host.match(/^172\.(\d+)\./)
  if (m) {
    const n = Number(m[1])
    if (n >= 16 && n <= 31) return true
  }
  return false
}

export function validateNetworkAccess(targetUrl: string): void {
  if (!IS_AIR_GAPPED_MODE) return
  let url: URL
  try {
    url = new URL(targetUrl)
  } catch {
    throw new Error(AIRGAP_ERROR)
  }
  if (!isPrivateOrLocalHost(url.hostname)) {
    throw new Error(AIRGAP_ERROR)
  }
}

export function assertAirGapAllowedFetch(input: RequestInfo | URL): void {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
  validateNetworkAccess(url)
}

export async function getAirGapModeAsync(): Promise<boolean> {
  return IS_AIR_GAPPED_MODE
}
