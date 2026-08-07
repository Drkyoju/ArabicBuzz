/** Canonical public site — never localhost. CranL primary after Netlify cutover. */
export const APP_ORIGIN = 'https://arabicbuzz-fooc9h.cranl.net'

const REJECTED_HOST =
  /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|your-site\.netlify\.app)(:\d+)?/i

function normalizePublicOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/\/$/, '').trim()
  if (!cleaned || REJECTED_HOST.test(cleaned)) return null
  try {
    const u = new URL(cleaned)
    if (
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname === '::1' ||
      u.hostname === '0.0.0.0' ||
      /your-site\.netlify\.app$/i.test(u.hostname)
    ) {
      return null
    }
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

/**
 * Public base URL for invites, auth redirects, and emails.
 * Prefers runtime browser inject, then NEXT_PUBLIC_APP_URL / APP_URL, then CranL.
 */
export function appBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const fromBoot = normalizePublicOrigin(
      (window as Window & { __AB_PUBLIC__?: { appUrl?: string } }).__AB_PUBLIC__
        ?.appUrl
    )
    if (fromBoot) return fromBoot
  }
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
  ]
  for (const raw of candidates) {
    const origin = normalizePublicOrigin(raw)
    if (origin) return origin
  }
  return APP_ORIGIN
}

export function authCallbackUrl(): string {
  return `${appBaseUrl()}/auth/callback`
}
