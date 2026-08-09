/**
 * Bootstrap Hermes ~/.hermes/google_token.json from ArabicBuzz's existing
 * Google refresh token (ryodan71) — no OAuth redirect / Console URI edit.
 *
 * Why: Potato App is a *Web* OAuth client; only the Supabase callback is
 * registered. Hermes' localhost:1 flow will always get redirect_uri_mismatch.
 * Refresh-token reuse with the same client id/secret does not need a redirect.
 *
 * Never prints tokens or client secret. Local-only write under ~/.hermes.
 *
 * Usage (from repo root):
 *   npx tsx scripts/hermes-drive-bootstrap-from-ab.ts
 */
import { readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ACCOUNT = (process.env.HERMES_GOOGLE_ACCOUNT_HINT || 'ryodan71@gmail.com')
  .trim()
  .toLowerCase()
const HERMES_HOME = process.env.HERMES_HOME || join(homedir(), '.hermes')
const TOKEN_OUT = join(HERMES_HOME, 'google_token.json')
const CLIENT_OUT = join(HERMES_HOME, 'google_client_secret.json')

const TAG_TO_SCOPE: Record<string, string> = {
  openid: 'openid',
  email: 'email',
  profile: 'profile',
  calendar: 'https://www.googleapis.com/auth/calendar',
  'calendar.events': 'https://www.googleapis.com/auth/calendar.events',
  'gmail.readonly': 'https://www.googleapis.com/auth/gmail.readonly',
  'gmail.send': 'https://www.googleapis.com/auth/gmail.send',
  'gmail.modify': 'https://www.googleapis.com/auth/gmail.modify',
  spreadsheets: 'https://www.googleapis.com/auth/spreadsheets',
  documents: 'https://www.googleapis.com/auth/documents',
  'drive.readonly': 'https://www.googleapis.com/auth/drive.readonly',
  'drive.file': 'https://www.googleapis.com/auth/drive.file',
  drive: 'https://www.googleapis.com/auth/drive',
  'contacts.readonly': 'https://www.googleapis.com/auth/contacts.readonly',
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    const key = m[1]
    if (process.env[key]) continue
    let val = m[2].trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

function expandScopes(raw: string | null): string[] {
  if (!raw) return []
  const parts = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    if (p.startsWith('http://') || p.startsWith('https://') || p === 'openid') {
      out.push(p)
      continue
    }
    const mapped = TAG_TO_SCOPE[p]
    if (mapped) out.push(mapped)
  }
  return [...new Set(out)]
}

async function refreshAccessToken(opts: {
  clientId: string
  clientSecret: string
  refreshToken: string
}): Promise<{ access_token: string; expires_in?: number; scope?: string }> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    refresh_token: opts.refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = (await res.json()) as {
    access_token?: string
    expires_in?: number
    scope?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !json.access_token) {
    throw new Error(
      `token refresh failed: ${json.error || res.status} ${json.error_description || ''}`.trim()
    )
  }
  return {
    access_token: json.access_token,
    expires_in: json.expires_in,
    scope: json.scope,
  }
}

async function main() {
  loadEnvFile(join(process.cwd(), '.env.cranl.local'))
  loadEnvFile(join(process.cwd(), '.env.local'))

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing in env files')
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL missing')
  }

  const prisma = new PrismaClient()
  try {
    const rows = (await prisma.$queryRawUnsafe(`
      SELECT email, refresh_token, scopes, access_token, expires_at
      FROM google_oauth_tokens
      WHERE lower(email) = lower($1)
        AND refresh_token IS NOT NULL
        AND length(refresh_token) > 0
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `, ACCOUNT)) as Array<{
      email: string
      refresh_token: string
      scopes: string | null
      access_token: string | null
      expires_at: Date | null
    }>

    if (!rows.length) {
      throw new Error(`No refresh token in DB for ${ACCOUNT}`)
    }

    const row = rows[0]
    const refreshed = await refreshAccessToken({
      clientId,
      clientSecret,
      refreshToken: row.refresh_token,
    })

    let scopes = expandScopes(row.scopes)
    if (refreshed.scope) {
      scopes = [...new Set([...scopes, ...refreshed.scope.split(/\s+/).filter(Boolean)])]
    }
    if (!scopes.some((s) => s.includes('drive'))) {
      console.warn(
        'WARNING: token has no Drive scope — list/get may fail. Re-link Google in ArabicBuzz first.'
      )
    }

    const tokenPayload = {
      token: refreshed.access_token,
      refresh_token: row.refresh_token,
      token_uri: 'https://oauth2.googleapis.com/token',
      client_id: clientId,
      client_secret: clientSecret,
      scopes,
      type: 'authorized_user',
      universe_domain: 'googleapis.com',
      account: row.email,
    }

    writeFileSync(TOKEN_OUT, JSON.stringify(tokenPayload, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
    chmodSync(TOKEN_OUT, 0o600)

    // Keep a truthful *web* client secret locally (Potato App is Web, not Desktop).
    // Hermes google-auth accepts either shape for refresh when token embeds credentials.
    const clientPayload = {
      web: {
        client_id: clientId,
        project_id: 'arabicbuzz-hermes',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_secret: clientSecret,
        redirect_uris: [
          'https://vqhbgujxhyodxcneexss.supabase.co/auth/v1/callback',
        ],
      },
    }
    writeFileSync(CLIENT_OUT, JSON.stringify(clientPayload, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
    chmodSync(CLIENT_OUT, 0o600)

    const driveTags = scopes
      .filter((s) => s.includes('drive'))
      .map((s) => s.replace('https://www.googleapis.com/auth/', ''))
    console.log('OK: Hermes token written (secrets not printed)')
    console.log(`account: ${row.email}`)
    console.log(`token_path: ${TOKEN_OUT}`)
    console.log(`drive_scopes: ${driveTags.join(',') || '(none)'}`)
    console.log(
      'note: Potato App is a Web client — use --from-arabicbuzz, not localhost:1 auth-url'
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : e)
  process.exit(1)
})
