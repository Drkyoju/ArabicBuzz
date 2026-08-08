/**
 * Exact-name recovery from Drive brain into room vault (no fuzzy match).
 * Used only for pending telegram_file_jobs expected_filename.
 */

function strictNameMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\u0640]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
  const na = norm(a)
  const nb = norm(b)
  if (na === nb) return true
  const base = (s: string) => s.replace(/\.[^.]+$/, '')
  return base(na) === base(nb)
}

export async function searchDriveBrainExactName(opts: {
  scopeId: string
  exactName: string
}): Promise<{ vaultFileId: string; fileName: string } | null> {
  const name = opts.exactName.trim()
  if (!name) return null

  try {
    const { resolveChannelOwnerUserIdAsync } = await import(
      '@/lib/channels/owner-context'
    )
    const ownerId = await resolveChannelOwnerUserIdAsync()
    if (!ownerId) return null

    const { findDriveBrainFile, downloadDriveFile } = await import(
      '@/lib/google/drive'
    )
    const meta = await findDriveBrainFile(ownerId, name)
    if (!meta || !strictNameMatch(meta.name, name)) return null

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
