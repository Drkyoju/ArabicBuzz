import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

/**
 * AES-256-GCM for IMAP/SMTP passwords stored in Postgres.
 * Prefer CRON_SECRET / AUDIT_EXPORT_SECRET as key material when set.
 */
const FALLBACK_VAULT = 'arabic-buzz-imap-vault-v1'

function encryptionSecrets(): string[] {
  const out: string[] = []
  for (const name of ['IMAP_VAULT_SECRET', 'CRON_SECRET', 'AUDIT_EXPORT_SECRET']) {
    const v = process.env[name]?.trim()
    if (v && v !== 'change-me') out.push(v)
  }
  out.push(FALLBACK_VAULT)
  return out
}

function encryptionKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(plain: string): string {
  const secret = encryptionSecrets()[0]!
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`
}

export function decryptSecret(payload: string): string | null {
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

export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 4) return '••••'
  return `••••${value.slice(-4)}`
}
