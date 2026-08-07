/** Canonical public site — never localhost. CranL primary after Netlify cutover. */
export const APP_ORIGIN = 'https://arabicbuzz-fooc9h.cranl.net'

const REJECTED_HOST =
  /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|your-site\.netlify\.app)(:\d+)?/i

/**
 * Public base URL for invites, auth redirects, and emails.
 * Prefers NEXT_PUBLIC_APP_URL / APP_URL, then falls back to CranL origin.
 */
export function appBaseUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
  ]
  for (const raw of candidates) {
    if (!raw) continue
    const cleaned = raw.replace(/\/$/, '').trim()
    if (!cleaned || REJECTED_HOST.test(cleaned)) continue
    try {
      const u = new URL(cleaned)
      if (
        u.hostname === 'localhost' ||
        u.hostname === '127.0.0.1' ||
        u.hostname === '::1' ||
        u.hostname === '0.0.0.0' ||
        /your-site\.netlify\.app$/i.test(u.hostname)
      ) {
        continue
      }
      return `${u.protocol}//${u.host}`
    } catch {
      continue
    }
  }
  return APP_ORIGIN
}

export function authCallbackUrl(): string {
  return `${appBaseUrl()}/auth/callback`
}
