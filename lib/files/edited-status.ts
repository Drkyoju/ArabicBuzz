/** Arabic badge / tag for agent- or user-edited workspace files. */
export const EDITED_TAG_AR = 'تم التعديل'

export type FileEditFlags = {
  editedAt?: string | null
  editedBy?: string | null
  tags?: string[] | null
}

export function isFileEdited(meta: FileEditFlags): boolean {
  if (meta.editedAt) return true
  if (meta.tags?.includes(EDITED_TAG_AR)) return true
  return false
}

/** One-shot backfill for known edited PDFs (e.g. التويمان) already in the vault. */
export function looksLikeEditedBackfill(
  id: string,
  originalName: string
): boolean {
  const idLower = id.toLowerCase()
  if (idLower.startsWith('5554f72a')) return true
  if (/تويمان/.test(originalName)) return true
  if (/اللائحة[_ ]?الاساسية[_ ]?محدثة/i.test(originalName)) return true
  return false
}

export function buildEditedMeta(opts?: {
  editedBy?: string
  existingTags?: string[] | null
}): { editedAt: string; editedBy: string; tags: string[] } {
  const tags = [...(opts?.existingTags || [])]
  if (!tags.includes(EDITED_TAG_AR)) tags.push(EDITED_TAG_AR)
  return {
    editedAt: new Date().toISOString(),
    editedBy: (opts?.editedBy || 'agent').slice(0, 120),
    tags,
  }
}
