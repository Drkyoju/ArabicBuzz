import { getSupabaseAdmin } from '@/lib/supabase/server'

export type GoogleTokenRow = {
  user_id: string
  email: string | null
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  scopes: string | null
}

export async function upsertGoogleTokens(opts: {
  userId: string
  email?: string | null
  accessToken: string
  refreshToken?: string | null
  expiresAt?: Date | null
  scopes?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false, error: 'Supabase غير مُعدّ' }

  // Keep prior refresh_token if Google omits it on re-consent
  let refresh = opts.refreshToken || null
  if (!refresh) {
    const { data: prev } = await sb
      .from('google_oauth_tokens')
      .select('refresh_token')
      .eq('user_id', opts.userId)
      .maybeSingle()
    refresh = (prev?.refresh_token as string | null) || null
  }

  const { error } = await sb.from('google_oauth_tokens').upsert(
    {
      user_id: opts.userId,
      email: opts.email || null,
      access_token: opts.accessToken,
      refresh_token: refresh,
      expires_at: opts.expiresAt?.toISOString() || null,
      scopes: opts.scopes || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getGoogleTokenRow(
  userId: string
): Promise<GoogleTokenRow | null> {
  const sb = getSupabaseAdmin()
  if (!sb) return null
  const { data, error } = await sb
    .from('google_oauth_tokens')
    .select('user_id, email, access_token, refresh_token, expires_at, scopes')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data as GoogleTokenRow
}

export async function deleteGoogleTokens(
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false, error: 'Supabase غير مُعدّ' }
  const { error } = await sb
    .from('google_oauth_tokens')
    .delete()
    .eq('user_id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date } | null> {
  const clientId =
    process.env.GOOGLE_CLIENT_ID || process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID
  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET
  if (!clientId || !clientSecret) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number
  }
  if (!data.access_token) return null
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
  }
}

/** Valid access token for Calendar/Gmail APIs, refreshing when needed. */
export async function getValidGoogleAccessToken(
  userId: string
): Promise<
  | { ok: true; accessToken: string; email: string | null }
  | { ok: false; error: string }
> {
  const row = await getGoogleTokenRow(userId)
  if (!row?.access_token) {
    return {
      ok: false,
      error:
        'تقويم Google غير مربوط. اربط الحساب من الإعدادات → تقويم Google.',
    }
  }

  const expiresMs = row.expires_at
    ? new Date(row.expires_at).getTime()
    : 0
  const stillFresh = expiresMs > Date.now() + 60_000

  if (stillFresh) {
    return { ok: true, accessToken: row.access_token, email: row.email }
  }

  if (!row.refresh_token) {
    return {
      ok: false,
      error: 'انتهت صلاحية الربط. أعد ربط تقويم Google من الإعدادات.',
    }
  }

  const refreshed = await refreshAccessToken(row.refresh_token)
  if (!refreshed) {
    return {
      ok: false,
      error:
        'تعذّر تجديد رمز Google. تأكد من GOOGLE_CLIENT_ID/SECRET على Netlify ثم أعد الربط.',
    }
  }

  await upsertGoogleTokens({
    userId,
    email: row.email,
    accessToken: refreshed.accessToken,
    refreshToken: row.refresh_token,
    expiresAt: refreshed.expiresAt,
    scopes: row.scopes,
  })

  return {
    ok: true,
    accessToken: refreshed.accessToken,
    email: row.email,
  }
}
