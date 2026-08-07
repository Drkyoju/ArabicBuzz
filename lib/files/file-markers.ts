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
  a: Pick<BridgeFilePayload, 'name' | 'fileId' | 'kind' | 'edited'>
): string {
  const editedTag = a.edited ? ' · تم التعديل' : ''
  if (a.kind === 'voice') {
    return `🎤 رسالة صوتية: ${a.name}${editedTag} (id:${a.fileId})`
  }
  return `📎 ملف جاهز للتنزيل: ${a.name}${editedTag} (id:${a.fileId})`
}

function kindFromNameMime(
  name: string,
  mime?: string
): BridgeFileKind {
  const m = (mime || '').toLowerCase()
  const n = name.toLowerCase()
  if (
    m.startsWith('audio/') ||
    /\.(ogg|opus|webm|mp3|m4a|wav|aac)$/i.test(n) ||
    /voice|صوت|ملاحظة صوتية/i.test(name)
  ) {
    return 'voice'
  }
  return 'file'
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
    const kind =
      raw.kind || kindFromNameMime(raw.name, raw.mimeType)
    out.push({
      ...raw,
      fileId: id,
      scopeId: raw.scopeId || scopeId,
      kind,
      mimeType:
        raw.mimeType ||
        (kind === 'voice' ? 'audio/ogg' : undefined),
    })
  }

  const reReady =
    /(?:📎\s*)?ملف جاهز للتنزيل:\s*(.+?)\s*\(id:([^\)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = reReady.exec(content))) {
    const rawName = m[1].trim()
    const edited = /(?:^|\s)·\s*تم التعديل\s*$/.test(rawName)
    const name = rawName.replace(/(?:\s*·\s*تم التعديل\s*)$/, '').trim()
    push({
      name,
      fileId: m[2].trim(),
      scopeId,
      kind: 'file',
      edited: edited || undefined,
    })
  }

  const reVoice = /🎤\s*رسالة صوتية:\s*(.+?)\s*\(id:([^\)]+)\)/g
  while ((m = reVoice.exec(content))) {
    const rawName = m[1].trim()
    const edited = /(?:^|\s)·\s*تم التعديل\s*$/.test(rawName)
    const name = rawName.replace(/(?:\s*·\s*تم التعديل\s*)$/, '').trim()
    push({
      name,
      fileId: m[2].trim(),
      scopeId,
      kind: 'voice',
      mimeType: 'audio/ogg',
      edited: edited || undefined,
    })
  }

  // Human composer attach: «مرفق للتعديل: «name» (id:…)»
  const reAttach =
    /(?:📎\s*)?مرفق للتعديل:\s*(?:«([^»]+)»|([^\n(]+?))\s*\(id:([^\)]+)\)/g
  while ((m = reAttach.exec(content))) {
    const name = (m[1] || m[2] || '').trim()
    push({
      name: name || `ملف-${m[3].trim().slice(0, 8)}`,
      fileId: m[3].trim(),
      scopeId,
      kind: kindFromNameMime(name),
    })
  }

  // Upload system line: تم حفظ …: «name» … المعرّف: id
  const reSaved =
    /تم حفظ\s+([^:]+):\s*«([^»]+)»[\s\S]{0,120}?المعرّف:\s*([a-zA-Z0-9_-]{8,})/g
  while ((m = reSaved.exec(content))) {
    const kindAr = m[1].trim()
    const name = m[2].trim()
    const voice =
      /صوت|ملاحظة صوتية|audio/i.test(kindAr) ||
      kindFromNameMime(name) === 'voice'
    push({
      name,
      fileId: m[3].trim(),
      scopeId,
      kind: voice ? 'voice' : 'file',
      mimeType: voice ? 'audio/ogg' : undefined,
    })
  }

  // Bare «name» (id:…) or (id:…) after file emoji — catch remaining room lines
  const reParenId = /«([^»]+)»\s*\(id:([a-zA-Z0-9_-]{8,})\)/g
  while ((m = reParenId.exec(content))) {
    push({
      name: m[1].trim(),
      fileId: m[2].trim(),
      scopeId,
      kind: kindFromNameMime(m[1].trim()),
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
