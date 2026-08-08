/**
 * Exact-name recovery from Drive brain into room vault (no fuzzy biology).
 * Optional seerah short-name alias for «المعلم الاول».
 */
import {
  isMuallimSeerahShortQuery,
  matchMuallimSeerahFile,
  pickMuallimSeerahFile,
} from '@/lib/files/muallim-seerah-match'
import { filenamesStrictMatch } from '@/lib/telegram/file-jobs'

export async function searchDriveBrainExactName(opts: {
  scopeId: string
  exactName: string
  allowMuallimSeerahAlias?: boolean
}): Promise<{ vaultFileId: string; fileName: string } | null> {
  const name = opts.exactName.trim()
  if (!name) return null

  try {
    const { resolveChannelOwnerUserIdAsync } = await import(
      '@/lib/channels/owner-context'
    )
    const ownerId = await resolveChannelOwnerUserIdAsync()
    if (!ownerId) return null

    const { findDriveBrainFile, downloadDriveFile, listDriveFolderFiles } =
      await import('@/lib/google/drive')

    let meta = await findDriveBrainFile(ownerId, name)

    if (
      !meta &&
      (opts.allowMuallimSeerahAlias || isMuallimSeerahShortQuery(name))
    ) {
      const files = await listDriveFolderFiles(ownerId, { recursive: true })
      const mapped = files.map((f) => ({ id: f.id, originalName: f.name }))
      const picked = pickMuallimSeerahFile(mapped, name)
      if (picked) {
        meta = files.find((f) => f.id === picked.id) || null
      }
    }

    if (!meta) return null
    if (
      !filenamesStrictMatch(meta.name, name) &&
      !matchMuallimSeerahFile(meta.name)
    ) {
      return null
    }
    // Hard ban biology even if somehow returned
    if (/أحياء|احياء|biology/i.test(meta.name)) return null

    const dl = await downloadDriveFile(ownerId, meta)
    if (!dl?.buffer?.length) return null

    const { saveWorkspaceFile } = await import('@/lib/documents/workspace')
    const saved = await saveWorkspaceFile({
      scopeId: opts.scopeId,
      buffer: Buffer.from(dl.buffer),
      originalName: meta.name || name,
      mimeType: dl.mimeType || meta.mimeType || 'application/octet-stream',
    })
    return {
      vaultFileId: saved.file.id,
      fileName: saved.file.originalName,
    }
  } catch (e) {
    console.warn('[telegram] drive exact recover', e)
    return null
  }
}
