/**
 * Merge vault listing across storage backends + chat attachment markers
 * so «ملفات الفريق» is not empty when files exist only as room markers
 * (or split across local/mac/cloud).
 */
import { parseFileMarkersFromText } from '@/lib/files/file-markers'
import {
  findWorkspaceFile,
  type WorkspaceFileRef,
} from '@/lib/documents/workspace'
import {
  isLocalStorageEnabled,
  listLocalFiles,
} from '@/lib/storage/local'
import { listCloudFiles } from '@/lib/storage/cloud'
import {
  getMacSyncConfig,
  macSyncConfigured,
} from '@/lib/storage/mac-sync-client'
import { getSupabaseAdmin } from '@/lib/supabase/server'

async function listMacRemote(scopeId: string) {
  const { baseUrl, secret } = getMacSyncConfig()
  if (!baseUrl) return [] as WorkspaceFileRef[]
  try {
    const res = await fetch(
      `${baseUrl}/files?scopeId=${encodeURIComponent(scopeId)}`,
      { headers: secret ? { Authorization: `Bearer ${secret}` } : {} }
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      files?: Array<{
        id: string
        originalName: string
        mimeType: string
        kind?: string
        size?: number
        createdAt?: string
        editedAt?: string
        editedBy?: string
        tags?: string[]
      }>
    }
    return (data.files || []).map((f) => ({
      id: f.id,
      originalName: f.originalName,
      mimeType: f.mimeType,
      kind: f.kind,
      size: f.size,
      createdAt: f.createdAt,
      editedAt: f.editedAt,
      editedBy: f.editedBy,
      tags: f.tags,
      source: 'mac' as const,
    }))
  } catch {
    return []
  }
}

/** Union local + mac + cloud (no early return). */
export async function listWorkspaceFilesAllSources(
  scopeId: string
): Promise<WorkspaceFileRef[]> {
  const byId = new Map<string, WorkspaceFileRef>()

  const push = (f: WorkspaceFileRef) => {
    if (!f.id) return
    const prev = byId.get(f.id)
    if (!prev) {
      byId.set(f.id, f)
      return
    }
    // Prefer richer metadata / newer editedAt
    const prevTs = Date.parse(prev.editedAt || prev.createdAt || '') || 0
    const nextTs = Date.parse(f.editedAt || f.createdAt || '') || 0
    if (nextTs >= prevTs) byId.set(f.id, { ...prev, ...f })
  }

  if (isLocalStorageEnabled()) {
    try {
      for (const f of listLocalFiles(scopeId)) {
        push({
          id: f.id,
          originalName: f.originalName,
          mimeType: f.mimeType,
          kind: f.kind,
          size: f.size,
          createdAt: f.createdAt,
          editedAt: f.editedAt,
          editedBy: f.editedBy,
          tags: f.tags,
          source: 'local',
        })
      }
    } catch {
      /* ignore */
    }
  }

  if (macSyncConfigured()) {
    for (const f of await listMacRemote(scopeId)) push(f)
  }

  try {
    for (const f of await listCloudFiles(scopeId)) {
      push({
        id: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        kind: f.kind,
        size: f.size,
        createdAt: f.createdAt,
        editedAt: f.editedAt,
        editedBy: f.editedBy,
        tags: f.tags,
        source: 'cloud',
      })
    }
  } catch {
    /* ignore */
  }

  return [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.createdAt || '') || 0
    const tb = Date.parse(b.createdAt || '') || 0
    return tb - ta
  })
}

async function loadRecentRoomPostContents(
  scopeId: string,
  limit = 200
): Promise<string[]> {
  const sb = getSupabaseAdmin()
  if (!sb) return []
  try {
    const { data, error } = await sb
      .from('room_posts')
      .select('content')
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data
      .map((r) => String((r as { content?: string }).content || ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

export type VaultSyncResult = {
  files: WorkspaceFileRef[]
  source: 'merged' | 'none'
  fromVault: number
  fromChat: number
  noteAr?: string
}

/**
 * List vault files and re-attach any chat attachment markers missing from the list.
 */
export async function syncVaultWithChatAttachments(
  scopeId: string
): Promise<VaultSyncResult> {
  const vault = await listWorkspaceFilesAllSources(scopeId)
  const byId = new Map(vault.map((f) => [f.id, f]))
  let fromChat = 0

  const posts = await loadRecentRoomPostContents(scopeId)
  for (const content of posts) {
    const markers = parseFileMarkersFromText(content, scopeId)
    for (const m of markers) {
      if (byId.has(m.fileId)) continue
      const found = await findWorkspaceFile(scopeId, m.fileId).catch(() => null)
      if (found) {
        byId.set(found.id, found)
        fromChat++
        continue
      }
      // Surface soft entry so archive is not empty (preview may still work via file API)
      byId.set(m.fileId, {
        id: m.fileId,
        originalName: m.name,
        mimeType: m.mimeType || 'application/octet-stream',
        kind: m.kind === 'voice' ? 'audio' : 'other',
        tags: ['from-chat'],
        source: 'cloud',
        createdAt: undefined,
      })
      fromChat++
    }
  }

  const files = [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.createdAt || '') || 0
    const tb = Date.parse(b.createdAt || '') || 0
    return tb - ta
  })

  return {
    files,
    source: files.length ? 'merged' : 'none',
    fromVault: vault.length,
    fromChat,
    noteAr:
      fromChat > 0
        ? `زُامن ${fromChat} مرفقاً من شات الغرفة مع الأرشيف.`
        : undefined,
  }
}
