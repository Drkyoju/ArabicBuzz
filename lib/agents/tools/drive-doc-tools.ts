/**
 * Open / save association Drive («عقل الشركة») documents for Gemini edit loops.
 */
import { extractDocumentText } from '@/lib/rag/extract'
import { ingestArabicDocument } from '@/lib/rag/ingest'
import { prisma, withPrismaFallback } from '@/lib/db'
import {
  downloadDriveFile,
  findDriveBrainFile,
  getDriveBrainFolderId,
  updateDriveFileMedia,
  uploadDriveBinaryFile,
} from '@/lib/google/drive'
import {
  inferFormatFromName,
  type DocFormat,
} from '@/lib/documents/build'
import { saveWorkspaceFile } from '@/lib/documents/workspace'
import { readWorkspaceFile, findWorkspaceFile } from '@/lib/documents/workspace'

const TEXT_PREVIEW_MAX = 24_000

async function reindexDriveFile(opts: {
  scopeId: string
  driveFileId: string
  titleAr: string
  buffer: Buffer
  filename: string
  mimeType: string
}) {
  const sourceFileId = `gdrive:${opts.driveFileId}`
  const folderUrl = `https://drive.google.com/drive/folders/${getDriveBrainFolderId()}`
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `DELETE FROM knowledge_documents WHERE source_file_id = $1`,
        sourceFileId
      ),
    0
  )
  const extracted = await extractDocumentText({
    buffer: opts.buffer,
    filename: opts.filename,
    mimeType: opts.mimeType,
    enableOcr: true,
  })
  if (!extracted.text.trim()) {
    return { chunks: 0, warning: 'لا نص لإعادة الفهرسة' }
  }
  const result = await ingestArabicDocument({
    scopeId: opts.scopeId,
    titleAr: opts.titleAr,
    content: extracted.text,
    sourceFileId,
    sourcePath: folderUrl,
  })
  return { chunks: result.chunks, warning: result.error }
}

/** Pull a Drive brain file into the room workspace for editing. */
export async function executeBrainOpenDocument(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = String(params.userId || '').trim()
  if (!userId || userId === 'engine' || userId === 'local-owner') {
    throw new Error(
      'يلزم تسجيل الدخول وربط Google لفتح ملفات عقل الشركة من Drive.'
    )
  }
  const scopeId = String(params.scopeId || 'shared-demo')
  const ref = String(
    params.driveFileId || params.fileId || params.name || params.queryAr || ''
  ).trim()
  if (!ref) {
    throw new Error('مرّر اسم الملف أو معرّف Drive أو استعلاماً قصيراً.')
  }

  const cleanRef = ref.replace(/^gdrive:/i, '')
  const meta = await findDriveBrainFile(userId, cleanRef)
  if (!meta) {
    throw new Error(
      `لم يُعثر على «${ref}» في مجلد ملفات الجمعية. استخدم search_knowledge_base أو اسم الملف كما في Drive.`
    )
  }

  const dl = await downloadDriveFile(userId, meta)
  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: dl.buffer,
    originalName: dl.filename || meta.name,
    mimeType: dl.mimeType,
  })

  const extracted = await extractDocumentText({
    buffer: dl.buffer,
    filename: saved.file.originalName,
    mimeType: saved.file.mimeType,
    enableOcr: true,
  })
  const text = extracted.text || ''
  const truncated = text.length > TEXT_PREVIEW_MAX
  const preview = truncated ? `${text.slice(0, TEXT_PREVIEW_MAX)}\n…` : text
  const format =
    (inferFormatFromName(saved.file.originalName) as DocFormat | null) ||
    'docx'

  const downloadPath = `/api/storage/file?id=${encodeURIComponent(saved.file.id)}&scopeId=${encodeURIComponent(scopeId)}`

  return {
    ok: true,
    driveFileId: meta.id,
    driveName: meta.name,
    driveUrl: meta.webViewLink || null,
    fileId: saved.file.id,
    name: saved.file.originalName,
    mimeType: saved.file.mimeType,
    suggestedFormat: format,
    extractMethod: extracted.method,
    charCount: text.length,
    truncated,
    text: preview,
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
    messageAr: `فُتح «${meta.name}» من عقل الشركة (Drive) في مساحة الغرفة. عدّله بـ edit_document ثم احفظه بـ brain_save_document لإعادته إلى Drive وإعادة فهرسته.`,
  }
}

/** Push an edited workspace file back to Drive (+ re-index brain). */
export async function executeBrainSaveDocument(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = String(params.userId || '').trim()
  if (!userId || userId === 'engine' || userId === 'local-owner') {
    throw new Error(
      'يلزم تسجيل الدخول وربط Google لحفظ الملفات في عقل الشركة.'
    )
  }
  const scopeId = String(params.scopeId || 'shared-demo')
  const fileRef = String(params.fileId || '').trim()
  if (!fileRef) throw new Error('مرّر fileId للملف المعدّل في مساحة الغرفة.')

  const found = await findWorkspaceFile(scopeId, fileRef)
  if (!found) {
    throw new Error(`لم يُعثر على الملف «${fileRef}» في مساحة الغرفة.`)
  }
  const hit = await readWorkspaceFile(scopeId, found.id)

  const driveFileId = String(params.driveFileId || '')
    .trim()
    .replace(/^gdrive:/i, '')
  const asNew = Boolean(params.asNew) || !driveFileId
  const outputName = String(params.outputName || hit.meta.originalName).trim()

  let driveMeta
  if (asNew || !driveFileId) {
    driveMeta = await uploadDriveBinaryFile(userId, {
      name: outputName,
      buffer: hit.buffer,
      mimeType: hit.meta.mimeType,
    })
  } else {
    driveMeta = await updateDriveFileMedia(userId, {
      fileId: driveFileId,
      buffer: hit.buffer,
      mimeType: hit.meta.mimeType,
      name: outputName,
    })
  }

  const index = await reindexDriveFile({
    scopeId,
    driveFileId: driveMeta.id,
    titleAr: driveMeta.name,
    buffer: hit.buffer,
    filename: driveMeta.name,
    mimeType: driveMeta.mimeType || hit.meta.mimeType,
  })

  const downloadPath = `/api/storage/file?id=${encodeURIComponent(hit.meta.id)}&scopeId=${encodeURIComponent(scopeId)}`

  return {
    ok: true,
    driveFileId: driveMeta.id,
    driveName: driveMeta.name,
    driveUrl: driveMeta.webViewLink || null,
    fileId: hit.meta.id,
    name: hit.meta.originalName,
    mimeType: hit.meta.mimeType,
    uploadedAsNew: asNew || !driveFileId,
    brainChunks: index.chunks,
    downloadPath,
    attachments: [
      {
        fileId: hit.meta.id,
        name: hit.meta.originalName,
        mimeType: hit.meta.mimeType,
        scopeId,
        downloadPath,
      },
    ],
    messageAr: asNew || !driveFileId
      ? `رُفع «${driveMeta.name}» إلى مجلد ملفات الجمعية وأُعيدت فهرسته (${index.chunks} مقطعاً). يمكن تنزيله من الشات أيضاً.`
      : `حُدّث الملف على Drive وأُعيدت فهرسة العقل (${index.chunks} مقطعاً). يمكن تنزيل النسخة من الشات.`,
  }
}

export async function executeBrainCreateDocument(
  _name: string,
  params: Record<string, unknown>
) {
  // Create via edit_document first is preferred; this uploads existing workspace file as new Drive doc.
  return executeBrainSaveDocument(_name, { ...params, asNew: true })
}

void 0
