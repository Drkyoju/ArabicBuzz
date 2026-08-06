/**
 * Agent tool: Arabic OCR for workspace images / scanned PDFs.
 * Supports fileId, phrase search in extracted text, and save to room memory + .txt.
 */
import { parseArabicDocument } from '@/lib/tools/arabic-ocr'
import {
  findWorkspaceFile,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { addRoomMemory } from '@/lib/rooms/room-memory'

const MEMORY_MAX = 12_000
const TEXT_RETURN_MAX = 24_000

function searchInText(
  text: string,
  query: string
): {
  found: boolean
  matchCount: number
  matches: Array<{ snippet: string; index: number }>
} {
  const q = query.trim()
  if (!q || !text) {
    return { found: false, matchCount: 0, matches: [] }
  }
  const lower = text.toLowerCase()
  const qLower = q.toLowerCase()
  const matches: Array<{ snippet: string; index: number }> = []
  let from = 0
  while (from < lower.length && matches.length < 12) {
    const idx = lower.indexOf(qLower, from)
    if (idx < 0) break
    const start = Math.max(0, idx - 80)
    const end = Math.min(text.length, idx + q.length + 80)
    const snippet =
      (start > 0 ? '…' : '') +
      text.slice(start, end).replace(/\s+/g, ' ').trim() +
      (end < text.length ? '…' : '')
    matches.push({ snippet, index: idx })
    from = idx + Math.max(q.length, 1)
  }
  // Fallback: token overlap if exact phrase missing
  if (!matches.length) {
    const tokens = qLower.split(/\s+/).filter((w) => w.length > 2)
    if (tokens.length) {
      for (const tok of tokens) {
        const idx = lower.indexOf(tok)
        if (idx < 0) continue
        const start = Math.max(0, idx - 80)
        const end = Math.min(text.length, idx + tok.length + 80)
        matches.push({
          snippet:
            (start > 0 ? '…' : '') +
            text.slice(start, end).replace(/\s+/g, ' ').trim() +
            (end < text.length ? '…' : ''),
          index: idx,
        })
        if (matches.length >= 8) break
      }
    }
  }
  return {
    found: matches.length > 0,
    matchCount: matches.length,
    matches,
  }
}

function stemName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || 'document'
  return `${base}-ocr.txt`
}

export async function executeArabicOcr(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const fileIdRef = String(params.fileId || params.path || params.name || '').trim()
  const fileUrl = params.fileUrl
    ? String(params.fileUrl)
    : params.url
      ? String(params.url)
      : ''
  const contentBase64 = params.contentBase64
    ? String(params.contentBase64)
    : ''
  const searchQuery = String(params.searchQuery || params.query || '').trim()
  const saveToMemory = params.saveToMemory !== false
  const saveAsFile = params.saveAsFile !== false

  let parsed: Awaited<ReturnType<typeof parseArabicDocument>>
  let sourceName = 'document'
  let sourceFileId: string | undefined

  if (fileIdRef) {
    const found = await findWorkspaceFile(scopeId, fileIdRef)
    if (!found) {
      throw new Error(
        `لم يُعثر على الملف «${fileIdRef}». استخدم list_workspace_files.`
      )
    }
    const hit = await readWorkspaceFile(scopeId, found.id)
    sourceName = hit.meta.originalName
    sourceFileId = hit.meta.id
    parsed = await parseArabicDocument(hit.buffer, {
      mimeType: hit.meta.mimeType,
      filename: hit.meta.originalName,
    })
  } else if (fileUrl || contentBase64) {
    const src = fileUrl || contentBase64
    parsed = await parseArabicDocument(src)
    sourceName =
      fileUrl.split('/').pop()?.split('?')[0] || 'inline-document'
  } else if (params.buffer != null) {
    parsed = await parseArabicDocument(
      Buffer.isBuffer(params.buffer)
        ? params.buffer
        : Buffer.from(params.buffer as ArrayBuffer)
    )
  } else {
    throw new Error('يلزم fileId أو fileUrl أو contentBase64 لمستند OCR.')
  }

  const fullText = (parsed.rawText || parsed.markdown || '').trim()
  const truncated = fullText.length > TEXT_RETURN_MAX
  const textOut = truncated
    ? `${fullText.slice(0, TEXT_RETURN_MAX)}\n…`
    : fullText

  const search = searchQuery
    ? searchInText(fullText, searchQuery)
    : null

  let memoryId: string | undefined
  let savedFileId: string | undefined
  let savedFileName: string | undefined
  let downloadPath: string | undefined

  if (parsed.ok && fullText) {
    if (saveToMemory) {
      try {
        const memBody = [
          `نص مستخرج (OCR) من «${sourceName}»:`,
          fullText.length > MEMORY_MAX
            ? `${fullText.slice(0, MEMORY_MAX)}\n…`
            : fullText,
        ].join('\n')
        const mem = await addRoomMemory({
          scopeId,
          content: memBody,
          createdBy: String(params.userId || 'agent'),
          createdByAr: 'OCR',
        })
        memoryId = mem.id
      } catch {
        /* memory optional */
      }
    }

    if (saveAsFile) {
      try {
        const outName = stemName(sourceName)
        const saved = await saveWorkspaceFile({
          scopeId,
          buffer: Buffer.from(fullText, 'utf8'),
          originalName: outName,
          mimeType: 'text/plain; charset=utf-8',
        })
        savedFileId = saved.file.id
        savedFileName = saved.file.originalName
        downloadPath = `/api/storage/file?id=${encodeURIComponent(saved.file.id)}&scopeId=${encodeURIComponent(scopeId)}`
      } catch {
        /* file save optional */
      }
    }
  }

  const parts: string[] = []
  if (parsed.ok && fullText) {
    parts.push(`استُخرج النص من «${sourceName}» عبر ${parsed.provider}.`)
    if (memoryId) parts.push('حُفظ في ذاكرة الغرفة (يمكن البحث لاحقاً بـ memory_search).')
    if (savedFileName) parts.push(`حُفظ ملف نصي: «${savedFileName}».`)
    if (search) {
      parts.push(
        search.found
          ? `عُثر على «${searchQuery}» (${search.matchCount} موضع).`
          : `لم يُعثر على «${searchQuery}» في النص المستخرج.`
      )
    }
  } else {
    parts.push(parsed.messageAr || 'تعذّر استخراج النص.')
  }

  return {
    ok: parsed.ok && Boolean(fullText),
    provider: parsed.provider,
    sourceFileId,
    sourceName,
    markdown: truncated ? textOut : parsed.markdown,
    text: textOut,
    tables: parsed.tables,
    charCount: fullText.length,
    truncated,
    searchQuery: searchQuery || undefined,
    search,
    memoryId,
    savedFileId,
    savedFileName,
    downloadPath,
    attachments:
      savedFileId && savedFileName && downloadPath
        ? [
            {
              fileId: savedFileId,
              name: savedFileName,
              mimeType: 'text/plain',
              scopeId,
              downloadPath,
            },
          ]
        : undefined,
    messageAr: parts.join(' '),
    error: parsed.error,
  }
}
