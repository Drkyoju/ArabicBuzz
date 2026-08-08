/**
 * Storage mesh search order (hard):
 * 1) Company Drive (primary archive)
 * 2) Telegram group attachment mirror
 * 3) Team room (غرفة الفريق) vault
 * 4) Mac sync bridge
 *
 * NEVER ask the user to resend if any store has a recoverable copy.
 */
import {
  isMuallimSeerahShortQuery,
  matchMuallimSeerahFile,
  normalizeArabicFilename,
  pickMuallimSeerahFile,
  isBiologyTeacherGuideName,
} from '@/lib/files/muallim-seerah-match'
import { matchWorkspaceFileExact } from '@/lib/files/file-source-policy'
import {
  listPersistedTelegramAttachments,
  type PersistedTelegramAttachment,
} from '@/lib/telegram/attachment-persist'

export type MeshSource = 'telegram_mirror' | 'room' | 'drive' | 'mac'

export type MeshHit = {
  source: MeshSource
  fileName: string
  vaultFileId?: string
  telegramFileId?: string
  driveFileId?: string
  buffer?: Buffer
  mimeType?: string
  sizeBytes?: number
}

function meshNamesMatch(a: string, b: string): boolean {
  if (isBiologyTeacherGuideName(a) || isBiologyTeacherGuideName(b)) return false
  const na = normalizeArabicFilename(a)
  const nb = normalizeArabicFilename(b)
  if (na === nb) return true
  const base = (s: string) => s.replace(/\.[^.]+$/, '')
  if (base(na) === base(nb)) return true
  if (
    (isMuallimSeerahShortQuery(a) && matchMuallimSeerahFile(b)) ||
    (isMuallimSeerahShortQuery(b) && matchMuallimSeerahFile(a))
  ) {
    return true
  }
  return false
}

function nameMatchesQuery(fileName: string, query: string): boolean {
  if (isBiologyTeacherGuideName(fileName)) return false
  return meshNamesMatch(fileName, query)
}

/**
 * Find a file by Arabic name/alias across all stores.
 * Order: Drive → Telegram mirror → team room → Mac.
 */
export async function findAcrossStorageMesh(opts: {
  scopeId: string
  chatId?: string
  queryName: string
  /** When true, download Drive/Mac/TG into room vault and return buffer. */
  hydrateBytes?: boolean
}): Promise<MeshHit | null> {
  const q = opts.queryName.trim()
  if (!q) return null

  // 1) Company Drive (primary durable archive)
  try {
    const { searchDriveBrainExactName } = await import(
      '@/lib/telegram/drive-exact-recover'
    )
    const driveHit = await searchDriveBrainExactName({
      scopeId: opts.scopeId,
      exactName: q,
      allowMuallimSeerahAlias:
        isMuallimSeerahShortQuery(q) || matchMuallimSeerahFile(q),
    })
    if (driveHit?.vaultFileId) {
      if (opts.hydrateBytes) {
        const { readWorkspaceFile } = await import('@/lib/documents/workspace')
        const file = await readWorkspaceFile(opts.scopeId, driveHit.vaultFileId)
        return {
          source: 'drive',
          fileName: driveHit.fileName,
          vaultFileId: driveHit.vaultFileId,
          buffer: file.buffer,
          mimeType: file.meta.mimeType,
          sizeBytes: file.buffer.length,
        }
      }
      return {
        source: 'drive',
        fileName: driveHit.fileName,
        vaultFileId: driveHit.vaultFileId,
      }
    }
  } catch {
    /* optional */
  }

  // 2) Telegram group attachment mirror
  if (opts.chatId) {
    const atts = await listPersistedTelegramAttachments(opts.chatId, 40)
    const attHit =
      atts.find(
        (a) => nameMatchesQuery(a.fileName, q) && a.hasBytes && a.vaultFileId
      ) ||
      atts.find((a) => nameMatchesQuery(a.fileName, q) && a.telegramFileId) ||
      null
    if (attHit) {
      if (attHit.hasBytes && attHit.vaultFileId && opts.hydrateBytes) {
        try {
          const { readWorkspaceFile } = await import('@/lib/documents/workspace')
          const hit = await readWorkspaceFile(opts.scopeId, attHit.vaultFileId)
          if (hit.buffer?.length) {
            return {
              source: 'telegram_mirror',
              fileName: attHit.fileName,
              vaultFileId: attHit.vaultFileId,
              telegramFileId: attHit.telegramFileId,
              buffer: hit.buffer,
              mimeType: hit.meta.mimeType,
              sizeBytes: hit.buffer.length,
            }
          }
        } catch {
          /* continue */
        }
      }
      if (attHit.telegramFileId && opts.hydrateBytes) {
        const dl = await tryDownloadTelegramFileId(attHit.telegramFileId, {
          fileName: attHit.fileName,
          sizeBytes: attHit.sizeBytes,
        })
        if (dl) {
          const saved = await persistBytesToRoomAndDrive({
            scopeId: opts.scopeId,
            chatId: opts.chatId,
            buffer: dl,
            fileName: attHit.fileName,
            mimeType: attHit.mimeType,
            telegramFileId: attHit.telegramFileId,
          })
          return {
            source: 'telegram_mirror',
            fileName: saved.fileName,
            vaultFileId: saved.vaultFileId,
            telegramFileId: attHit.telegramFileId,
            buffer: dl,
            mimeType: attHit.mimeType,
            sizeBytes: dl.length,
          }
        }
      }
      if (attHit.vaultFileId || attHit.telegramFileId) {
        return {
          source: 'telegram_mirror',
          fileName: attHit.fileName,
          vaultFileId: attHit.vaultFileId,
          telegramFileId: attHit.telegramFileId,
          mimeType: attHit.mimeType,
          sizeBytes: attHit.sizeBytes,
        }
      }
    }
  }

  // 3) Team room (غرفة الفريق) vault
  try {
    const { listWorkspaceFiles, readWorkspaceFile } = await import(
      '@/lib/documents/workspace'
    )
    const files = await listWorkspaceFiles(opts.scopeId)
    let hit = matchWorkspaceFileExact(files, q)
    if (!hit && isMuallimSeerahShortQuery(q)) {
      hit = pickMuallimSeerahFile(files, q)
    }
    if (hit && !isBiologyTeacherGuideName(hit.originalName)) {
      if (opts.hydrateBytes) {
        const file = await readWorkspaceFile(opts.scopeId, hit.id)
        return {
          source: 'room',
          fileName: hit.originalName,
          vaultFileId: hit.id,
          buffer: file.buffer,
          mimeType: file.meta.mimeType,
          sizeBytes: file.buffer.length,
        }
      }
      return {
        source: 'room',
        fileName: hit.originalName,
        vaultFileId: hit.id,
        sizeBytes: hit.size,
      }
    }
  } catch {
    /* optional */
  }

  // 4) Mac sync bridge
  try {
    const macHit = await findOnMacSync(opts.scopeId, q)
    if (macHit) {
      if (opts.hydrateBytes && macHit.buffer) {
        const { saveWorkspaceFile } = await import('@/lib/documents/workspace')
        const saved = await saveWorkspaceFile({
          scopeId: opts.scopeId,
          buffer: macHit.buffer,
          originalName: macHit.fileName,
          mimeType: macHit.mimeType || 'application/octet-stream',
        })
        void pushVaultToDriveBestEffort({
          scopeId: opts.scopeId,
          vaultFileId: saved.file.id,
          fileName: saved.file.originalName,
        })
        return {
          source: 'mac',
          fileName: saved.file.originalName,
          vaultFileId: saved.file.id,
          buffer: macHit.buffer,
          mimeType: macHit.mimeType,
          sizeBytes: macHit.buffer.length,
        }
      }
      return macHit
    }
  } catch {
    /* optional */
  }

  return null
}

async function tryDownloadTelegramFileId(
  fileId: string,
  meta?: { fileName?: string; sizeBytes?: number }
): Promise<Buffer | null> {
  try {
    const { downloadTelegramFileCascaded } = await import(
      '@/lib/telegram/large-file-download'
    )
    const r = await downloadTelegramFileCascaded({
      fileId,
      fileName: meta?.fileName,
      declaredSizeBytes: meta?.sizeBytes,
    })
    if (r.buffer?.length) return r.buffer
  } catch {
    /* fall through */
  }
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
    if (!token) return null
    const metaRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
    ).then((r) => r.json())
    if (!metaRes.ok || !metaRes.result?.file_path) return null
    const res = await fetch(
      `https://api.telegram.org/file/bot${token}/${metaRes.result.file_path}`
    )
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length ? buf : null
  } catch {
    return null
  }
}

async function findOnMacSync(
  scopeId: string,
  query: string
): Promise<MeshHit | null> {
  const { macSyncConfigured, getMacSyncConfig, macReadFile } = await import(
    '@/lib/storage/mac-sync-client'
  )
  if (!macSyncConfigured()) return null
  const { baseUrl, secret } = getMacSyncConfig()
  const headers: HeadersInit = {}
  if (secret) headers.Authorization = `Bearer ${secret}`
  const res = await fetch(
    `${baseUrl}/files?scopeId=${encodeURIComponent(scopeId)}`,
    { headers, signal: AbortSignal.timeout(12_000) }
  )
  if (!res.ok) return null
  const data = (await res.json()) as {
    files?: Array<{
      id: string
      originalName: string
      mimeType?: string
      size?: number
    }>
  }
  const files = data.files || []
  let hit = matchWorkspaceFileExact(files, query)
  if (!hit && isMuallimSeerahShortQuery(query)) {
    hit = pickMuallimSeerahFile(files, query)
  }
  if (!hit || isBiologyTeacherGuideName(hit.originalName)) return null

  try {
    const file = await macReadFile(scopeId, hit.id)
    if (file?.buffer?.length) {
      return {
        source: 'mac',
        fileName: hit.originalName,
        vaultFileId: hit.id,
        buffer: Buffer.from(file.buffer),
        mimeType: file.meta.mimeType || hit.mimeType,
        sizeBytes: file.buffer.length,
      }
    }
  } catch {
    /* metadata only */
  }
  return {
    source: 'mac',
    fileName: hit.originalName,
    vaultFileId: hit.id,
    sizeBytes: hit.size,
  }
}

export async function pushVaultToDriveBestEffort(opts: {
  scopeId: string
  vaultFileId: string
  fileName: string
}): Promise<{ ok: boolean; driveFileId?: string; errorAr?: string }> {
  try {
    const { resolveChannelOwnerUserIdAsync } = await import(
      '@/lib/channels/owner-context'
    )
    const ownerId = await resolveChannelOwnerUserIdAsync()
    if (!ownerId || opts.scopeId.startsWith('personal-')) {
      return { ok: false, errorAr: 'لا يوجد حساب Google مرتبط للأرشفة' }
    }
    const { uploadRoomFileToCompanyBrain } = await import(
      '@/lib/google/drive-brain'
    )
    const r = await uploadRoomFileToCompanyBrain({
      userId: ownerId,
      scopeId: opts.scopeId,
      localFileId: opts.vaultFileId,
    })
    return { ok: true, driveFileId: r.driveFileId }
  } catch (e) {
    return {
      ok: false,
      errorAr: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function persistBytesToRoomAndDrive(opts: {
  scopeId: string
  chatId?: string
  buffer: Buffer
  fileName: string
  mimeType?: string
  telegramFileId?: string
}): Promise<{ vaultFileId: string; fileName: string; driveOk: boolean }> {
  const { saveWorkspaceFile } = await import('@/lib/documents/workspace')
  const name = opts.fileName.includes('.')
    ? opts.fileName
    : `${opts.fileName}.bin`
  const saved = await saveWorkspaceFile({
    scopeId: opts.scopeId,
    buffer: opts.buffer,
    originalName: name,
    mimeType: opts.mimeType || 'application/octet-stream',
  })

  if (opts.chatId) {
    try {
      const { persistTelegramAttachment } = await import(
        '@/lib/telegram/attachment-persist'
      )
      await persistTelegramAttachment({
        chatId: opts.chatId,
        scopeId: opts.scopeId,
        telegramFileId: opts.telegramFileId,
        fileName: saved.file.originalName,
        mimeType: saved.file.mimeType,
        sizeBytes: opts.buffer.length,
        vaultFileId: saved.file.id,
        hasBytes: true,
      })
    } catch {
      /* non-fatal */
    }
  }

  const drive = await pushVaultToDriveBestEffort({
    scopeId: opts.scopeId,
    vaultFileId: saved.file.id,
    fileName: saved.file.originalName,
  })

  return {
    vaultFileId: saved.file.id,
    fileName: saved.file.originalName,
    driveOk: drive.ok,
  }
}

export function pickAttachmentForQuery(
  atts: PersistedTelegramAttachment[],
  query: string
): PersistedTelegramAttachment | null {
  const matched = atts.filter((a) => nameMatchesQuery(a.fileName, query))
  return (
    matched.find((a) => a.hasBytes && a.vaultFileId) ||
    matched.find((a) => a.telegramFileId) ||
    matched[0] ||
    null
  )
}
