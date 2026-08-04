/**
 * Netlify → Mac sync agent client (tunnel).
 * Used when BRAIN_PRIMARY=mac or for forwarding uploads/search.
 */

export function isBrainPrimaryMac() {
  return (process.env.BRAIN_PRIMARY || '').toLowerCase() === 'mac'
}

export function getMacSyncConfig() {
  const baseUrl = (process.env.MAC_SYNC_URL || '').replace(/\/$/, '')
  const secret =
    process.env.MAC_SYNC_SECRET?.trim() ||
    process.env.LOCAL_STORAGE_SYNC_SECRET?.trim() ||
    ''
  const publicUploadUrl = (
    process.env.NEXT_PUBLIC_MAC_UPLOAD_URL ||
    process.env.MAC_SYNC_URL ||
    ''
  ).replace(/\/$/, '')
  return { baseUrl, secret, publicUploadUrl }
}

export function macSyncConfigured() {
  return Boolean(getMacSyncConfig().baseUrl)
}

async function macFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { baseUrl, secret } = getMacSyncConfig()
  if (!baseUrl) {
    throw new Error(
      'MAC_SYNC_URL غير مضبوط. شغّل npm run storage:sync على الماك وضبط النفق على Netlify.'
    )
  }
  const headers = new Headers(init?.headers)
  if (secret) headers.set('Authorization', `Bearer ${secret}`)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 25_000)
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      signal: ctrl.signal,
    })
  } finally {
    clearTimeout(t)
  }
}

export async function macHealth(): Promise<{
  ok: boolean
  storage?: unknown
  brain?: unknown
  error?: string
}> {
  try {
    const res = await macFetch('/health', { timeoutMs: 8_000 })
    const data = (await res.json()) as {
      ok?: boolean
      storage?: unknown
      brain?: unknown
      error?: string
    }
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` }
    return {
      ok: Boolean(data.ok),
      storage: data.storage,
      brain: data.brain,
    }
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.name === 'AbortError'
            ? 'وكيل الماك لا يستجيب — تأكد أن npm run storage:sync والنفق يعملان.'
            : e.message
          : 'تعذّر الاتصال بوكيل الماك',
    }
  }
}

export async function macBrainSearch(opts: {
  queryAr: string
  scopeId: string
  limit?: number
  source?: 'drive' | 'all'
}) {
  const res = await macFetch('/brain/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...opts, source: opts.source ?? 'drive' }),
    timeoutMs: 20_000,
  })
  const data = (await res.json()) as {
    ok?: boolean
    documents?: Array<{
      id: string
      titleAr: string
      content: string
      rrfScore: number
      rankBm25: number | null
      rankVector: number | null
      metadata?: Record<string, unknown>
    }>
    error?: string
  }
  if (!res.ok || !data.ok) {
    throw new Error(
      data.error ||
        'فشل البحث في عقل الماك. شغّل وكيل المزامنة (npm run storage:sync).'
    )
  }
  return data.documents || []
}

export async function macBrainIngest(opts: {
  scopeId: string
  titleAr: string
  content: string
  sourceFileId?: string
  sourcePath?: string
}) {
  const res = await macFetch('/brain/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
    timeoutMs: 60_000,
  })
  const data = (await res.json()) as {
    ok?: boolean
    chunks?: number
    error?: string
    messageAr?: string
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'فشل الاستيعاب على الماك')
  }
  return data
}

export async function macBrainStatus() {
  const res = await macFetch('/brain/status', { timeoutMs: 10_000 })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(String(data.error || `HTTP ${res.status}`))
  }
  return data
}

/** Max bytes Netlify will still hop to Mac as base64 JSON. */
export const NETLIFY_MAC_HOP_MAX = 32 * 1024 * 1024

export function directMacUploadInfo() {
  const { publicUploadUrl, secret } = getMacSyncConfig()
  if (!publicUploadUrl) return null
  return {
    uploadUrl: `${publicUploadUrl}/upload`,
    secretHeader: secret ? 'Authorization' : null,
    secretValue: secret ? `Bearer ${secret}` : null,
    maxBytes: Number(process.env.MAC_MAX_UPLOAD_BYTES || 8 * 1024 * 1024 * 1024),
  }
}

export async function macReadFile(scopeId: string, id: string) {
  const res = await macFetch(
    `/files/${encodeURIComponent(id)}?scopeId=${encodeURIComponent(scopeId)}`,
    { timeoutMs: 120_000 }
  )
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || `Mac read HTTP ${res.status}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const originalName = decodeURIComponent(
    res.headers.get('X-Original-Name') || 'file.bin'
  )
  const mimeType =
    res.headers.get('Content-Type') || 'application/octet-stream'
  return {
    buffer: buf,
    meta: { id, originalName, mimeType, scopeId },
  }
}

export async function macDeleteFile(scopeId: string, id: string) {
  const res = await macFetch(
    `/files/${encodeURIComponent(id)}?scopeId=${encodeURIComponent(scopeId)}`,
    { method: 'DELETE', timeoutMs: 30_000 }
  )
  const data = (await res.json()) as {
    ok?: boolean
    error?: string
    messageAr?: string
    file?: unknown
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'فشل الحذف على الماك')
  }
  return data
}

export async function macRenameFile(
  scopeId: string,
  id: string,
  originalName: string
) {
  const res = await macFetch(`/files/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scopeId, originalName }),
    timeoutMs: 20_000,
  })
  const data = (await res.json()) as {
    ok?: boolean
    error?: string
    messageAr?: string
    file?: unknown
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'فشل إعادة التسمية')
  }
  return data
}

export async function macReplaceFile(opts: {
  scopeId: string
  id: string
  buffer: Buffer
  originalName?: string
  mimeType?: string
}) {
  const res = await macFetch(
    `/files/${encodeURIComponent(opts.id)}?scopeId=${encodeURIComponent(opts.scopeId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': opts.mimeType || 'application/octet-stream',
        'X-Scope-Id': opts.scopeId,
        ...(opts.originalName
          ? { 'X-Original-Name': encodeURIComponent(opts.originalName) }
          : {}),
        ...(opts.mimeType ? { 'X-Mime-Type': opts.mimeType } : {}),
      },
      body: new Uint8Array(opts.buffer),
      timeoutMs: 120_000,
    }
  )
  const data = (await res.json()) as {
    ok?: boolean
    error?: string
    messageAr?: string
    file?: unknown
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'فشل استبدال الملف')
  }
  return data
}

/** Direct replace URL for large files (browser → Mac). */
export function directMacReplaceInfo(id: string) {
  const base = directMacUploadInfo()
  if (!base) return null
  const { publicUploadUrl } = getMacSyncConfig()
  return {
    ...base,
    replaceUrl: `${publicUploadUrl}/files/${encodeURIComponent(id)}`,
  }
}
