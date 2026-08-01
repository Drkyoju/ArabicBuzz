import {
  isLocalStorageEnabled,
  listLocalFiles,
  readLocalFile,
  replaceLocalFile,
  saveLocalFile,
  type StoredFileMeta,
} from '@/lib/storage/local'
import {
  listCloudFiles,
  readCloudFile,
  saveCloudFile,
} from '@/lib/storage/cloud'
import {
  getMacSyncConfig,
  macReadFile,
  macReplaceFile,
  macSyncConfigured,
  NETLIFY_MAC_HOP_MAX,
} from '@/lib/storage/mac-sync-client'
import { getSupabaseAdmin } from '@/lib/supabase/server'

export type WorkspaceFileRef = {
  id: string
  originalName: string
  mimeType: string
  kind?: string
  size?: number
  createdAt?: string
  source: 'local' | 'mac' | 'cloud'
}

async function listMacRemoteFiles(scopeId: string): Promise<StoredFileMeta[]> {
  const { baseUrl, secret } = getMacSyncConfig()
  if (!baseUrl) return []
  try {
    const res = await fetch(
      `${baseUrl}/files?scopeId=${encodeURIComponent(scopeId)}`,
      {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      }
    )
    if (!res.ok) return []
    const data = (await res.json()) as { files?: StoredFileMeta[] }
    return data.files || []
  } catch {
    return []
  }
}

async function forwardToMacSync(opts: {
  scopeId: string
  buffer: Buffer
  originalName: string
  mimeType: string
}): Promise<StoredFileMeta> {
  const { baseUrl, secret } = getMacSyncConfig()
  if (!baseUrl) throw new Error('MAC_SYNC_URL غير مضبوط')
  if (opts.buffer.length > NETLIFY_MAC_HOP_MAX) {
    throw new Error(
      `الملف أكبر من حد النقل عبر Netlify (${Math.round(NETLIFY_MAC_HOP_MAX / (1024 * 1024))}MB).`
    )
  }
  const res = await fetch(`${baseUrl}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({
      scopeId: opts.scopeId,
      originalName: opts.originalName,
      mimeType: opts.mimeType,
      contentBase64: opts.buffer.toString('base64'),
    }),
  })
  const data = (await res.json()) as {
    ok?: boolean
    file?: StoredFileMeta
    error?: string
  }
  if (!res.ok || !data.ok || !data.file) {
    throw new Error(data.error || `Mac sync HTTP ${res.status}`)
  }
  return data.file
}

export async function listWorkspaceFiles(
  scopeId: string
): Promise<WorkspaceFileRef[]> {
  if (isLocalStorageEnabled()) {
    try {
      const local = listLocalFiles(scopeId)
      if (local.length) {
        return local.map((f) => ({
          id: f.id,
          originalName: f.originalName,
          mimeType: f.mimeType,
          kind: f.kind,
          size: f.size,
          createdAt: f.createdAt,
          source: 'local' as const,
        }))
      }
    } catch {
      /* continue */
    }
  }

  if (macSyncConfigured()) {
    const mac = await listMacRemoteFiles(scopeId)
    if (mac.length) {
      return mac.map((f) => ({
        id: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        kind: f.kind,
        size: f.size,
        createdAt: f.createdAt,
        source: 'mac' as const,
      }))
    }
  }

  const cloud = await listCloudFiles(scopeId)
  return cloud.map((f) => ({
    id: f.id,
    originalName: f.originalName,
    mimeType: f.mimeType,
    kind: f.kind,
    size: f.size,
    createdAt: f.createdAt,
    source: 'cloud' as const,
  }))
}

export async function readWorkspaceFile(
  scopeId: string,
  id: string
): Promise<{
  meta: {
    id: string
    originalName: string
    mimeType: string
    scopeId: string
    source: 'local' | 'mac' | 'cloud'
  }
  buffer: Buffer
}> {
  if (macSyncConfigured()) {
    try {
      const hit = await macReadFile(scopeId, id)
      return {
        buffer: hit.buffer,
        meta: {
          id,
          originalName: hit.meta.originalName,
          mimeType: hit.meta.mimeType,
          scopeId,
          source: 'mac',
        },
      }
    } catch {
      /* fall through */
    }
  }

  if (isLocalStorageEnabled()) {
    try {
      const hit = readLocalFile(scopeId, id)
      if (hit) {
        return {
          buffer: hit.buffer,
          meta: {
            id: hit.meta.id,
            originalName: hit.meta.originalName,
            mimeType: hit.meta.mimeType,
            scopeId,
            source: 'local',
          },
        }
      }
    } catch {
      /* fall through */
    }
  }

  const cloud = await readCloudFile(scopeId, id)
  if (!cloud) {
    throw new Error('الملف غير موجود. ارفعه من قسم الملفات أو أعطِ معرّف ملف صحيح.')
  }
  return {
    buffer: cloud.buffer,
    meta: {
      id: cloud.meta.id,
      originalName: cloud.meta.originalName,
      mimeType: cloud.meta.mimeType,
      scopeId,
      source: 'cloud',
    },
  }
}

export async function findWorkspaceFile(
  scopeId: string,
  fileIdOrName: string
): Promise<WorkspaceFileRef | null> {
  const files = await listWorkspaceFiles(scopeId)
  const q = fileIdOrName.trim()
  const byId = files.find((f) => f.id === q)
  if (byId) return byId
  const lower = q.toLowerCase()
  return (
    files.find((f) => f.originalName.toLowerCase() === lower) ||
    files.find((f) => f.originalName.toLowerCase().includes(lower)) ||
    null
  )
}

async function replaceCloudFile(opts: {
  scopeId: string
  id: string
  buffer: Buffer
  originalName: string
  mimeType: string
}): Promise<StoredFileMeta> {
  const sb = getSupabaseAdmin()
  if (!sb) throw new Error('لا قاعدة بيانات لاستبدال الملف السحابي')
  const kind = opts.originalName.toLowerCase().endsWith('.xlsx')
    ? 'xlsx'
    : opts.originalName.toLowerCase().endsWith('.pptx')
      ? 'pptx'
      : opts.originalName.toLowerCase().match(/\.(docx?|txt|md)$/)
        ? 'doc'
        : 'other'
  const { error } = await sb.from('workspace_files').upsert({
    id: opts.id,
    scope_id: opts.scopeId,
    original_name: opts.originalName,
    mime_type: opts.mimeType,
    kind,
    size: opts.buffer.length,
    content_base64: opts.buffer.toString('base64'),
  })
  if (error) throw new Error(error.message)
  return {
    id: opts.id,
    scopeId: opts.scopeId,
    kind: kind as StoredFileMeta['kind'],
    originalName: opts.originalName,
    mimeType: opts.mimeType,
    size: opts.buffer.length,
    relativePath: `cloud:${opts.id}`,
    createdAt: new Date().toISOString(),
    sha256: '',
  }
}

export async function saveWorkspaceFile(opts: {
  scopeId: string
  buffer: Buffer
  originalName: string
  mimeType: string
  replaceId?: string
}): Promise<{ file: StoredFileMeta; source: 'local' | 'mac' | 'cloud' }> {
  if (opts.replaceId) {
    if (macSyncConfigured()) {
      try {
        const data = await macReplaceFile({
          scopeId: opts.scopeId,
          id: opts.replaceId,
          buffer: opts.buffer,
          originalName: opts.originalName,
          mimeType: opts.mimeType,
        })
        const file = (data.file || {
          id: opts.replaceId,
          scopeId: opts.scopeId,
          originalName: opts.originalName,
          mimeType: opts.mimeType,
          size: opts.buffer.length,
          kind: 'other',
          relativePath: '',
          createdAt: new Date().toISOString(),
          sha256: '',
        }) as StoredFileMeta
        return { file, source: 'mac' }
      } catch {
        /* fall through */
      }
    }
    if (isLocalStorageEnabled()) {
      try {
        const replaced = replaceLocalFile(
          opts.scopeId,
          opts.replaceId,
          opts.buffer,
          {
            originalName: opts.originalName,
            mimeType: opts.mimeType,
          }
        )
        if (replaced.ok) return { file: replaced.meta, source: 'local' }
      } catch {
        /* fall through */
      }
    }
    const cloud = await replaceCloudFile({
      scopeId: opts.scopeId,
      id: opts.replaceId,
      buffer: opts.buffer,
      originalName: opts.originalName,
      mimeType: opts.mimeType,
    })
    return { file: cloud, source: 'cloud' }
  }

  if (macSyncConfigured()) {
    try {
      const file = await forwardToMacSync(opts)
      return { file, source: 'mac' }
    } catch {
      /* fall through */
    }
  }

  if (isLocalStorageEnabled()) {
    try {
      const file = saveLocalFile(opts)
      return { file, source: 'local' }
    } catch {
      /* fall through */
    }
  }

  const cloud = await saveCloudFile(opts)
  if (!cloud.ok) throw new Error(cloud.error)
  return { file: cloud.file, source: 'cloud' }
}
