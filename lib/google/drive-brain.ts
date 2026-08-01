import { extractDocumentText } from '@/lib/rag/extract'
import { ingestArabicDocument } from '@/lib/rag/ingest'
import {
  downloadDriveFile,
  getDriveBrainFolderId,
  listDriveFolderFiles,
  type DriveFileMeta,
} from '@/lib/google/drive'
import {
  isBrainPrimaryMac,
  macBrainIngest,
  macSyncConfigured,
} from '@/lib/storage/mac-sync-client'

export type DriveSyncResult = {
  ok: boolean
  folderId: string
  folderUrl: string
  scanned: number
  ingested: number
  skipped: number
  errors: Array<{ name: string; error: string }>
  files: Array<{ id: string; name: string; chunks?: number }>
  messageAr: string
}

const SKIP_MIME = new Set([
  'application/vnd.google-apps.form',
  'application/vnd.google-apps.map',
  'application/vnd.google-apps.site',
])

async function ingestText(opts: {
  scopeId: string
  titleAr: string
  content: string
  sourceFileId: string
  sourcePath: string
}): Promise<number> {
  if (isBrainPrimaryMac() && macSyncConfigured()) {
    const data = await macBrainIngest({
      scopeId: opts.scopeId,
      titleAr: opts.titleAr,
      content: opts.content,
      sourceFileId: opts.sourceFileId,
      sourcePath: opts.sourcePath,
    })
    return Number(data.chunks || 0)
  }
  const result = await ingestArabicDocument({
    scopeId: opts.scopeId,
    titleAr: opts.titleAr,
    content: opts.content,
    sourceFileId: opts.sourceFileId,
    sourcePath: opts.sourcePath,
  })
  if (!result.ok) throw new Error(result.error || 'فشل الاستيعاب')
  return result.chunks
}

/** Sync Google Drive folder into company brain (Supabase or Mac). */
export async function syncDriveFolderToBrain(opts: {
  userId: string
  scopeId: string
  folderId?: string
  maxFiles?: number
}): Promise<DriveSyncResult> {
  const folderId = opts.folderId || getDriveBrainFolderId()
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`
  const maxFiles = opts.maxFiles ?? 40

  const listed = await listDriveFolderFiles(opts.userId, {
    folderId,
    recursive: true,
  })
  const files = listed
    .filter((f) => !SKIP_MIME.has(f.mimeType))
    .slice(0, maxFiles)

  const errors: DriveSyncResult['errors'] = []
  const done: DriveSyncResult['files'] = []
  let ingested = 0
  let skipped = 0

  for (const file of files) {
    try {
      const dl = await downloadDriveFile(opts.userId, file)
      // Cap single download ~25MB for serverless extract
      if (dl.buffer.length > 25 * 1024 * 1024) {
        skipped += 1
        errors.push({
          name: file.name,
          error: 'أكبر من 25MB للاستخراج في هذه الجولة',
        })
        continue
      }
      const extracted = await extractDocumentText({
        buffer: dl.buffer,
        filename: dl.filename,
        mimeType: dl.mimeType,
        enableOcr: true,
      })
      if (!extracted.text.trim()) {
        skipped += 1
        errors.push({ name: file.name, error: 'لا نص قابل للاستخراج' })
        continue
      }
      const chunks = await ingestText({
        scopeId: opts.scopeId,
        titleAr: file.name,
        content: extracted.text,
        sourceFileId: `gdrive:${file.id}`,
        sourcePath: folderUrl,
      })
      ingested += 1
      done.push({ id: file.id, name: file.name, chunks })
    } catch (e) {
      errors.push({
        name: file.name,
        error: e instanceof Error ? e.message : 'فشل',
      })
    }
  }

  return {
    ok: ingested > 0 || files.length === 0,
    folderId,
    folderUrl,
    scanned: files.length,
    ingested,
    skipped,
    errors,
    files: done,
    messageAr:
      files.length === 0
        ? 'المجلد فارغ أو لا يمكن قراءته — تأكد أن حساب Google مربوط وله صلاحية على المجلد.'
        : `تمت مزامنة ${ingested} من ${files.length} ملف من Google Drive إلى عقل الشركة${
            isBrainPrimaryMac() ? ' (ماك)' : ''
          }.`,
  }
}

export async function listDriveBrainPreview(
  userId: string,
  folderId?: string
): Promise<{ folderId: string; folderUrl: string; files: DriveFileMeta[] }> {
  const id = folderId || getDriveBrainFolderId()
  const files = await listDriveFolderFiles(userId, {
    folderId: id,
    recursive: true,
  })
  return {
    folderId: id,
    folderUrl: `https://drive.google.com/drive/folders/${id}`,
    files,
  }
}
