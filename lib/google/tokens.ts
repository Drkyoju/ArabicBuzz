import { getSupabaseAdmin } from '@/lib/supabase/server'

export type GoogleTokenRow = {
  id?: string
  user_id: string
  email: string | null
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  scopes: string | null
  updated_at?: string | null
}

function normalizeEmail(email?: string | null): string | null {
  const e = (email || '').trim().toLowerCase()
  return e || null
}

/** Resolve the Google account email from the OAuth access token. */
export async function fetchGoogleAccountEmail(
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { email?: string }
    return normalizeEmail(data.email)
  } catch {
    return null
  }
}

export async function listGoogleAccounts(
  userId: string
): Promise<GoogleTokenRow[]> {
  const sb = getSupabaseAdmin()
  if (!sb) return []
  const { data, error } = await sb
    .from('google_oauth_tokens')
    .select(
      'id, user_id, email, access_token, refresh_token, expires_at, scopes, updated_at'
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error || !data) return []
  return data as GoogleTokenRow[]
}

export async function upsertGoogleTokens(opts: {
  userId: string
  email?: string | null
  accessToken: string
  refreshToken?: string | null
  expiresAt?: Date | null
  scopes?: string | null
}): Promise<{ ok: boolean; error?: string; email?: string }> {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false, error: 'Supabase غير مُعدّ' }

  let email =
    normalizeEmail(opts.email) ||
    (await fetchGoogleAccountEmail(opts.accessToken))
  if (!email) {
    email = `unknown+${opts.userId.slice(0, 8)}@local.invalid`
  }

  let refresh = opts.refreshToken || null
  if (!refresh) {
    const { data: prev } = await sb
      .from('google_oauth_tokens')
      .select('refresh_token')
      .eq('user_id', opts.userId)
      .eq('email', email)
      .maybeSingle()
    refresh = (prev?.refresh_token as string | null) || null
  }

  const { error } = await sb.from('google_oauth_tokens').upsert(
    {
      user_id: opts.userId,
      email,
      access_token: opts.accessToken,
      refresh_token: refresh,
      expires_at: opts.expiresAt?.toISOString() || null,
      scopes: opts.scopes || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,email' }
  )
  if (error) {
    // Fallback for DBs that still have old PK (user_id only)
    if (
      error.message.includes('no unique') ||
      error.message.includes('onConflict') ||
      error.code === '42P10'
    ) {
      const { error: e2 } = await sb.from('google_oauth_tokens').upsert(
        {
          user_id: opts.userId,
          email,
          access_token: opts.accessToken,
          refresh_token: refresh,
          expires_at: opts.expiresAt?.toISOString() || null,
          scopes: opts.scopes || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      if (e2) return { ok: false, error: e2.message }
      return { ok: true, email }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, email }
}

/** Most recently updated account, or a specific email. */
export async function getGoogleTokenRow(
  userId: string,
  email?: string | null
): Promise<GoogleTokenRow | null> {
  const sb = getSupabaseAdmin()
  if (!sb) return null
  const want = normalizeEmail(email)
  if (want) {
    const { data, error } = await sb
      .from('google_oauth_tokens')
      .select(
        'id, user_id, email, access_token, refresh_token, expires_at, scopes, updated_at'
      )
      .eq('user_id', userId)
      .eq('email', want)
      .maybeSingle()
    if (error || !data) return null
    return data as GoogleTokenRow
  }
  const rows = await listGoogleAccounts(userId)
  return rows[0] || null
}

export async function deleteGoogleTokens(
  userId: string,
  email?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false, error: 'Supabase غير مُعدّ' }
  const want = normalizeEmail(email)
  let q = sb.from('google_oauth_tokens').delete().eq('user_id', userId)
  if (want) q = q.eq('email', want)
  const { error } = await q
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date } | null> {
  const clientId =
    process.env.GOOGLE_CLIENT_ID ||
    process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID
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

async function tokenFromRow(
  row: GoogleTokenRow
): Promise<
  | { ok: true; accessToken: string; email: string | null }
  | { ok: false; error: string }
> {
  const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : 0
  const stillFresh = expiresMs > Date.now() + 60_000

  if (stillFresh) {
    return { ok: true, accessToken: row.access_token, email: row.email }
  }

  if (!row.refresh_token) {
    return {
      ok: false,
      error: `انتهت صلاحية الربط لـ ${row.email || 'الحساب'}. أعد الربط من الإعدادات.`,
    }
  }

  const refreshed = await refreshAccessToken(row.refresh_token)
  if (!refreshed) {
    return {
      ok: false,
      error:
        'تعذّر تجديد رمز Google. تأكد من GOOGLE_CLIENT_ID/SECRET على CranL ثم أعد الربط.',
    }
  }

  await upsertGoogleTokens({
    userId: row.user_id,
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

/** Valid access token for one Google email (or the latest linked account). */
export async function getValidGoogleAccessToken(
  userId: string,
  email?: string | null
): Promise<
  | { ok: true; accessToken: string; email: string | null }
  | { ok: false; error: string }
> {
  const row = await getGoogleTokenRow(userId, email)
  if (!row?.access_token) {
    return {
      ok: false,
      error:
        'لا توكن Google محفوظ بعد. للمالك: من الإعدادات أكمل تسجيل دخول Google مرة واحدة فقط — بعدها يُستخدم تلقائياً.',
    }
  }
  return tokenFromRow(row)
}

/** Valid tokens for all linked emails (or a subset). */
export async function getValidGoogleAccessTokens(
  userId: string,
  emails?: string[] | null
): Promise<Array<{ email: string; accessToken: string }>> {
  const rows = await listGoogleAccounts(userId)
  const want = (emails || [])
    .map((e) => normalizeEmail(e))
    .filter((e): e is string => Boolean(e))
  const selected =
    want.length > 0
      ? rows.filter((r) => r.email && want.includes(r.email.toLowerCase()))
      : rows

  const out: Array<{ email: string; accessToken: string }> = []
  for (const row of selected) {
    const tok = await tokenFromRow(row)
    if (tok.ok && tok.email) {
      out.push({ email: tok.email, accessToken: tok.accessToken })
    }
  }
  return out
}
