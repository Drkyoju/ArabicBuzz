/** Canonical public site — never localhost. */
export const APP_ORIGIN = 'https://arabicbuzz.netlify.app'

const REJECTED_HOST =
  /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|your-site\.netlify\.app)(:\d+)?/i

/**
 * Public base URL for invites, auth redirects, and emails.
 * Always resolves to the live Netlify site unless a non-local APP_URL is set.
 */
export function appBaseUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
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
