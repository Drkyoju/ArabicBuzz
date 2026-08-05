/**
 * Convert between PDF and Word (and related) with Arabic-aware rebuild.
 * Round-trip is text-based (layout/images not preserved) but RTL text is kept.
 */
import { extractDocumentText } from '@/lib/rag/extract'
import {
  buildDocumentBuffer,
  ensureFilename,
  inferFormatFromName,
  type DocFormat,
} from '@/lib/documents/build'
import {
  findWorkspaceFile,
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { nextVersionFileName } from '@/lib/documents/versions'

const ALLOWED: DocFormat[] = ['docx', 'pdf', 'txt', 'md']

export async function executeConvertDocument(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const ref = String(params.fileId || params.path || params.name || '').trim()
  if (!ref) {
    throw new Error('مرّر fileId للملف المراد تحويله.')
  }

  const toRaw = String(params.toFormat || params.format || '')
    .toLowerCase()
    .trim()
  const toFormat = (toRaw === 'word' ? 'docx' : toRaw) as DocFormat
  if (!ALLOWED.includes(toFormat)) {
    throw new Error(
      `التحويل المدعوم: pdf ↔ docx (و txt/md). طُلب: ${toRaw || '—'}`
    )
  }

  const found = await findWorkspaceFile(scopeId, ref)
  if (!found) {
    throw new Error(
      `لم يُعثر على «${ref}». افتحه من Drive بـ brain_open_document أو من list_workspace_files.`
    )
  }

  const hit = await readWorkspaceFile(scopeId, found.id)
  const fromFormat =
    (inferFormatFromName(hit.meta.originalName) as DocFormat | null) || 'txt'

  if (fromFormat === toFormat) {
    throw new Error(`الملف بالفعل بصيغة ${toFormat}.`)
  }

  const extracted = await extractDocumentText({
    buffer: hit.buffer,
    filename: hit.meta.originalName,
    mimeType: hit.meta.mimeType,
    enableOcr: true,
  })
  const text = (extracted.text || '').trim()
  if (!text) {
    throw new Error(
      'تعذّر استخراج نص عربي/لاتيني صالح للتحويل. جرّب arabic_ocr أولاً للملفات الممسوحة.'
    )
  }

  // Preserve paragraph breaks for Arabic readability
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const baseName = hit.meta.originalName.replace(/\.[^.]+$/, '')
  let outputName = String(params.outputName || '').trim()
  if (!outputName) {
    const existing = await listWorkspaceFiles(scopeId)
    const next = nextVersionFileName(
      `${baseName}.${toFormat}`,
      existing.map((f) => f.originalName)
    )
    outputName = next.fileName
  }
  const filename = ensureFilename(outputName, toFormat)

  const built = await buildDocumentBuffer({
    format: toFormat,
    title: params.title != null ? String(params.title) : baseName,
    paragraphs,
    body: paragraphs.join('\n\n'),
  })

  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: built.buffer,
    originalName: filename,
    mimeType: built.mimeType,
  })

  const downloadPath = `/api/storage/file?id=${encodeURIComponent(saved.file.id)}&scopeId=${encodeURIComponent(scopeId)}`

  return {
    ok: true,
    fileId: saved.file.id,
    name: saved.file.originalName,
    mimeType: saved.file.mimeType,
    fromFormat,
    toFormat,
    sourceFileId: hit.meta.id,
    sourceName: hit.meta.originalName,
    charCount: text.length,
    paragraphCount: paragraphs.length,
    extractMethod: extracted.method,
    ocrUsed: extracted.ocrUsed,
    downloadPath,
    attachments: [
      {
        fileId: saved.file.id,
        name: saved.file.originalName,
        mimeType: saved.file.mimeType,
        scopeId,
        downloadPath,
      },
    ],
    messageAr: `حُوّل «${hit.meta.originalName}» من ${fromFormat} إلى ${toFormat} مع الحفاظ على النص العربي (إعادة بناء نصية — بدون صور/تخطيط أصلي). الملف جاهز للتنزيل في الشات.`,
    noteAr:
      'التحويل نصّي ذكي: المحتوى العربي يُحفظ في Word/PDF جديد. الجداول المعقّدة والصور لا تُنسخ كما هي.',
  }
}
