'use client'

import type { Session } from '@supabase/supabase-js'
import { GOOGLE_WORKSPACE_SCOPE_TAGS } from '@/lib/google/scopes'

/**
 * Persist Google provider tokens from a Supabase session into
 * google_oauth_tokens (Calendar / Drive / Gmail).
 */
export async function persistGoogleProviderTokens(
  session: Session | null | undefined,
  scopes = GOOGLE_WORKSPACE_SCOPE_TAGS
): Promise<{ ok: boolean; error?: string }> {
  if (!session?.access_token) return { ok: false, error: 'لا جلسة' }
  const providerToken = (session as Session & { provider_token?: string })
    .provider_token
  if (!providerToken) return { ok: false, error: 'لا رمز Google' }

  const refresh = (
    session as Session & { provider_refresh_token?: string }
  ).provider_refresh_token

  // Prefer scopes Google actually put on the provider access token.
  let scopesToStore = scopes
  try {
    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(providerToken)}`
    )
    const info = (await infoRes.json()) as { scope?: string }
    if (info.scope) {
      const tags = info.scope
        .split(/\s+/)
        .map((s) =>
          s
            .replace('https://www.googleapis.com/auth/', '')
            .replace('https://www.googleapis.com/userinfo.', 'userinfo.')
        )
        .filter((s) => s && s !== 'openid' && !s.startsWith('userinfo.'))
      // Keep known workspace tags only (stable DB format)
      const wanted = new Set(scopes.split(',').map((s) => s.trim()))
      const hit = tags.filter((t) => wanted.has(t) || t === 'drive' || t === 'documents' || t === 'contacts.readonly')
      if (hit.length) scopesToStore = [...new Set(hit)].join(',')
    }
  } catch {
    /* keep aspirational tags */
  }

  try {
    const res = await fetch('/api/google/calendar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: 'save-tokens',
        accessToken: providerToken,
        refreshToken: refresh || null,
        email: session.user.email,
        expiresAt: new Date(Date.now() + 3500_000).toISOString(),
        scopes: scopesToStore,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'فشل حفظ الرموز',
    }
  }
}
