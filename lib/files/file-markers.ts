/**
 * Pure file-marker helpers (safe for server + client).
 */

export type BridgeFileKind = 'file' | 'voice' | 'edited'

export type BridgeFilePayload = {
  fileId: string
  name: string
  mimeType?: string
  scopeId: string
  kind?: BridgeFileKind
  edited?: boolean
}

export function formatDownloadMarker(
  a: Pick<BridgeFilePayload, 'name' | 'fileId' | 'kind'>
): string {
  if (a.kind === 'voice') {
    return `🎤 رسالة صوتية: ${a.name} (id:${a.fileId})`
  }
  return `📎 ملف جاهز للتنزيل: ${a.name} (id:${a.fileId})`
}

/** Parse download / voice markers and telegram ingest lines from mirrored text. */
export function parseFileMarkersFromText(
  content: string,
  scopeId: string
): BridgeFilePayload[] {
  const out: BridgeFilePayload[] = []
  const seen = new Set<string>()
  const push = (raw: BridgeFilePayload) => {
    const id = raw.fileId.trim()
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push({ ...raw, fileId: id, scopeId: raw.scopeId || scopeId })
  }

  const reReady =
    /(?:📎\s*)?ملف جاهز للتنزيل:\s*(.+?)\s*\(id:([^\)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = reReady.exec(content))) {
    push({
      name: m[1].trim(),
      fileId: m[2].trim(),
      scopeId,
      kind: 'file',
    })
  }

  const reVoice = /🎤\s*رسالة صوتية:\s*(.+?)\s*\(id:([^\)]+)\)/g
  while ((m = reVoice.exec(content))) {
    push({
      name: m[1].trim(),
      fileId: m[2].trim(),
      scopeId,
      kind: 'voice',
      mimeType: 'audio/ogg',
    })
  }

  const reIngest =
    /ملف مرفوع من تيليجرام:\s*«([^»]+)»\s*\(fileId=([^,\s)]+)(?:,\s*mime=([^)]+))?\)/g
  while ((m = reIngest.exec(content))) {
    const mime = m[3]?.trim()
    push({
      name: m[1].trim(),
      fileId: m[2].trim(),
      scopeId,
      mimeType: mime,
      kind: mime?.startsWith('audio/') ? 'voice' : 'file',
    })
  }

  const reFileIdOnly = /\bfileId[=:]([a-zA-Z0-9_-]{8,})/g
  while ((m = reFileIdOnly.exec(content))) {
    const id = m[1].trim()
    if (seen.has(id)) continue
    push({
      name: `ملف-${id.slice(0, 8)}`,
      fileId: id,
      scopeId,
      kind: 'file',
    })
  }

  return out
}

export function composerHintForFile(p: BridgeFilePayload): string {
  if (p.kind === 'voice') {
    return `🎤 صوت مرفق: «${p.name}» (fileId=${p.fileId}) — فرّغ الصوت ونفّذ المطلوب.`
  }
  return `📎 مرفق: «${p.name}» (fileId=${p.fileId}) — اقرأ/عدّل حسب الطلب.`
}
