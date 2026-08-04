import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { prisma, withPrismaFallback } from '@/lib/db'
import { PROVIDER_DEFS, type ProviderDef } from '@/lib/ai/provider-defs'

/** In-process overlay (warm Lambda / local). DB is durable. */
const memoryOverrides = new Map<string, string>()

/**
 * Built-in vault key for UI-saved provider overrides.
 * Prefer Netlify env vars for production keys — no extra secrets required.
 */
const PROVIDER_VAULT_SECRET = 'arabic-buzz-provider-vault-v1'

function encryptionSecrets(): string[] {
  return [PROVIDER_VAULT_SECRET]
}

function encryptionKey(secret?: string): Buffer {
  return createHash('sha256')
    .update(secret || PROVIDER_VAULT_SECRET)
    .digest()
}

function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`
}

function decrypt(payload: string): string | null {
  const [ver, ivB64, tagB64, dataB64] = payload.split(':')
  if (ver !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null
  for (const secret of encryptionSecrets()) {
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        encryptionKey(secret),
        Buffer.from(ivB64, 'base64url')
      )
      decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64url')),
        decipher.final(),
      ]).toString('utf8')
    } catch {
      /* try next secret */
    }
  }
  return null
}

async function ensureTable(): Promise<void> {
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS provider_api_keys (
          env_name TEXT PRIMARY KEY,
          value_enc TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `),
    0
  )
}

function envValue(def: ProviderDef): string {
  const names = [def.envName, ...(def.aliases || [])]
  for (const name of names) {
    const v = process.env[name]?.trim()
    if (v) return v
  }
  return ''
}

export type KeySource = 'override' | 'environment' | 'absent'

export type ProviderKeyStatus = {
  envName: string
  labelAr: string
  labelEn: string
  kind: ProviderDef['kind']
  hintAr: string
  docsUrl?: string
  source: KeySource
  configured: boolean
  /** Never the secret — only whether a non-empty value exists. */
  maskedHint: string | null
}

function maskHint(value: string): string {
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 3)}…${value.slice(-4)}`
}

async function loadOverride(envName: string): Promise<string | null> {
  if (memoryOverrides.has(envName)) {
    return memoryOverrides.get(envName) || null
  }
  await ensureTable()
  const row = await withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<Array<{ value_enc: string }>>(
        `SELECT value_enc FROM provider_api_keys WHERE env_name = $1 LIMIT 1`,
        envName
      ),
    [] as Array<{ value_enc: string }>
  )
  const enc = row[0]?.value_enc
  if (!enc) return null
  const plain = decrypt(enc)
  if (plain) memoryOverrides.set(envName, plain)
  return plain
}

/**
 * Resolve a provider secret: UI override → env / aliases → empty.
 */
export async function resolveProviderKey(envName: string): Promise<string> {
  const def =
    PROVIDER_DEFS.find((p) => p.envName === envName) ||
    PROVIDER_DEFS.find((p) => p.aliases?.includes(envName))
  const canonical = def?.envName || envName

  const override = await loadOverride(canonical)
  if (override?.trim()) return override.trim()

  if (def) {
    const fromEnv = envValue(def)
    if (fromEnv) return fromEnv
  }
  return process.env[envName]?.trim() || ''
}

/** Sync helper for hot paths that already warmed the cache / env. */
export function resolveProviderKeySync(envName: string): string {
  const def =
    PROVIDER_DEFS.find((p) => p.envName === envName) ||
    PROVIDER_DEFS.find((p) => p.aliases?.includes(envName))
  const canonical = def?.envName || envName
  const mem = memoryOverrides.get(canonical)
  if (mem?.trim()) return mem.trim()
  if (def) {
    const fromEnv = envValue(def)
    if (fromEnv) return fromEnv
  }
  return process.env[envName]?.trim() || ''
}

export async function setProviderKey(
  envName: string,
  apiKey: string
): Promise<void> {
  const def = PROVIDER_DEFS.find((p) => p.envName === envName)
  if (!def) throw new Error(`مزوّد غير معروف: ${envName}`)
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('المفتاح فارغ')

  memoryOverrides.set(envName, trimmed)
  // Also expose to process.env for code that still reads env directly.
  process.env[envName] = trimmed

  await ensureTable()
  const enc = encrypt(trimmed)
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `INSERT INTO provider_api_keys (env_name, value_enc, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (env_name) DO UPDATE
         SET value_enc = EXCLUDED.value_enc, updated_at = NOW()`,
        envName,
        enc
      ),
    0
  )
}

export async function deleteProviderKey(envName: string): Promise<void> {
  memoryOverrides.delete(envName)
  await ensureTable()
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `DELETE FROM provider_api_keys WHERE env_name = $1`,
        envName
      ),
    0
  )
}

export async function listProviderKeyStatuses(): Promise<ProviderKeyStatus[]> {
  await ensureTable()
  const rows = await withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<Array<{ env_name: string; value_enc: string }>>(
        `SELECT env_name, value_enc FROM provider_api_keys`
      ),
    [] as Array<{ env_name: string; value_enc: string }>
  )
  for (const row of rows) {
    if (!memoryOverrides.has(row.env_name)) {
      const plain = decrypt(row.value_enc)
      if (plain) memoryOverrides.set(row.env_name, plain)
    }
  }

  return PROVIDER_DEFS.map((def) => {
    const override = memoryOverrides.get(def.envName)?.trim() || ''
    const fromEnv = envValue(def)
    let source: KeySource = 'absent'
    let value = ''
    if (override) {
      source = 'override'
      value = override
    } else if (fromEnv) {
      source = 'environment'
      value = fromEnv
    }
    return {
      envName: def.envName,
      labelAr: def.labelAr,
      labelEn: def.labelEn,
      kind: def.kind,
      hintAr: def.hintAr,
      docsUrl: def.docsUrl,
      source,
      configured: source !== 'absent',
      maskedHint: value ? maskHint(value) : null,
    }
  })
}

/** Warm memory cache from DB (call once per request before sync reads). */
export async function warmProviderKeyCache(): Promise<void> {
  await listProviderKeyStatuses()
}
