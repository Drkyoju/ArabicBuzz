import { extractDocumentText } from '@/lib/rag/extract'
import { ingestArabicDocument } from '@/lib/rag/ingest'
import {
  downloadDriveFile,
  getDriveBrainFolderId,
  listDriveFolderFiles,
  type DriveFileMeta,
} from '@/lib/google/drive'
import { prisma, withPrismaFallback } from '@/lib/db'
import { randomUUID } from 'crypto'

export type DriveSyncResult = {
  ok: boolean
  folderId: string
  folderUrl: string
  scanned: number
  ingested: number
  skipped: number
  alreadyIndexed: number
  errors: Array<{ name: string; error: string }>
  files: Array<{ id: string; name: string; chunks?: number }>
  hasMore: boolean
  remaining: number
  messageAr: string
}

const SKIP_MIME = new Set([
  'application/vnd.google-apps.form',
  'application/vnd.google-apps.map',
  'application/vnd.google-apps.site',
])

function filePriority(f: DriveFileMeta): number {
  const m = f.mimeType || ''
  const n = f.name.toLowerCase()
  if (m.includes('pdf') || n.endsWith('.pdf')) return 0
  if (m.includes('word') || n.endsWith('.docx') || n.endsWith('.doc')) return 1
  if (m.includes('sheet') || n.endsWith('.xlsx') || n.endsWith('.xls')) return 3
  return 2
}

/** Cloud brain only — Drive sync never uses Mac vault. */
async function ingestTextCloud(opts: {
  scopeId: string
  titleAr: string
  content: string
  sourceFileId: string
  sourcePath: string
}): Promise<number> {
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `DELETE FROM knowledge_documents WHERE source_file_id = $1`,
        opts.sourceFileId
      ),
    0
  )
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

/** Mark file as processed so failed extracts don't block the queue forever. */
async function markDriveFileSkipped(opts: {
  scopeId: string
  titleAr: string
  sourceFileId: string
  sourcePath: string
  reasonAr: string
}) {
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `DELETE FROM knowledge_documents WHERE source_file_id = $1`,
        opts.sourceFileId
      ),
    0
  )
  // Tiny zero embedding stub — keeps source_file_id in the indexed set
  const zeros = `[${Array(1024).fill(0).join(',')}]`
  await withPrismaFallback(
    () =>
      prisma.$executeRawUnsafe(
        `INSERT INTO knowledge_documents
           (id, scope_id, title_ar, content, embedding, source_file_id, source_path)
         VALUES ($1::uuid, $2, $3, $4, $5::vector, $6, $7)`,
        randomUUID(),
        opts.scopeId,
        `تخطي · ${opts.titleAr}`,
        `لم يُفهرس هذا الملف: ${opts.reasonAr}`,
        zeros,
        opts.sourceFileId,
        opts.sourcePath
      ),
    0
  )
}

async function alreadyIndexedIds(sourceIds: string[]): Promise<Set<string>> {
  if (sourceIds.length === 0) return new Set()
  const rows = await withPrismaFallback(
    () =>
      prisma.$queryRawUnsafe<Array<{ source_file_id: string }>>(
        `SELECT DISTINCT source_file_id
         FROM knowledge_documents
         WHERE source_file_id = ANY($1::text[])
           AND title_ar NOT LIKE 'تخطي · %'
           AND content NOT LIKE 'لم يُفهرس هذا الملف:%'`,
        sourceIds
      ),
    [] as Array<{ source_file_id: string }>
  )
  return new Set(rows.map((r) => r.source_file_id).filter(Boolean))
}

/**
 * Sync Google Drive «ملفات الجمعية» into cloud company brain (Supabase).
 * Does not use Mac storage.
 */
export async function syncDriveFolderToBrain(opts: {
  userId: string
  scopeId: string
  folderId?: string
  maxFiles?: number
  force?: boolean
}): Promise<DriveSyncResult> {
  const folderId = opts.folderId || getDriveBrainFolderId()
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`
  const batchLimit = opts.maxFiles ?? 8
  const maxBytes = 40 * 1024 * 1024

  const listed = await listDriveFolderFiles(opts.userId, {
    folderId,
    recursive: true,
  })
  const allFiles = listed
    .filter((f) => !SKIP_MIME.has(f.mimeType))
    .sort((a, b) => {
      const p = filePriority(a) - filePriority(b)
      if (p !== 0) return p
      return Number(a.size || 0) - Number(b.size || 0)
    })

  const sourceIds = allFiles.map((f) => `gdrive:${f.id}`)
  const indexed = opts.force
    ? new Set<string>()
    : await alreadyIndexedIds(sourceIds)

  const pending = allFiles.filter((f) => !indexed.has(`gdrive:${f.id}`))
  const files = pending.slice(0, batchLimit)
  const remaining = Math.max(0, pending.length - files.length)

  const errors: DriveSyncResult['errors'] = []
  const done: DriveSyncResult['files'] = []
  let ingested = 0
  let skipped = 0
  const alreadyIndexed = allFiles.length - pending.length

  for (const file of files) {
    const sourceFileId = `gdrive:${file.id}`
    try {
      const dl = await downloadDriveFile(opts.userId, file)
      if (dl.buffer.length > maxBytes) {
        skipped += 1
        errors.push({
          name: file.name,
          error: 'أكبر من 40MB — قسّم الملف أو ارفعه كنسخة أخف',
        })
        await markDriveFileSkipped({
          scopeId: opts.scopeId,
          titleAr: file.name,
          sourceFileId,
          sourcePath: folderUrl,
          reasonAr: 'أكبر من 40MB',
        })
        continue
      }
      const extracted = await extractDocumentText({
        buffer: dl.buffer,
        filename: dl.filename,
        mimeType: dl.mimeType,
        enableOcr: true,
      })
      if (!extracted.text.trim() || extracted.text.trim() === '[object Object]') {
        skipped += 1
        errors.push({ name: file.name, error: 'لا نص قابل للاستخراج' })
        await markDriveFileSkipped({
          scopeId: opts.scopeId,
          titleAr: file.name,
          sourceFileId,
          sourcePath: folderUrl,
          reasonAr: 'لا نص قابل للاستخراج',
        })
        continue
      }
      const chunks = await ingestTextCloud({
        scopeId: opts.scopeId,
        titleAr: file.name,
        content: extracted.text,
        sourceFileId,
        sourcePath: folderUrl,
      })
      ingested += 1
      done.push({ id: file.id, name: file.name, chunks })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'فشل'
      errors.push({ name: file.name, error: msg })
      skipped += 1
      try {
        await markDriveFileSkipped({
          scopeId: opts.scopeId,
          titleAr: file.name,
          sourceFileId,
          sourcePath: folderUrl,
          reasonAr: msg,
        })
      } catch {
        /* ignore */
      }
    }
  }

  const hasMore = remaining > 0
  return {
    ok: ingested > 0 || alreadyIndexed + skipped > 0,
    folderId,
    folderUrl,
    scanned: allFiles.length,
    ingested,
    skipped,
    alreadyIndexed,
    errors,
    files: done,
    hasMore,
    remaining,
    messageAr:
      allFiles.length === 0
        ? 'المجلد فارغ أو لا يمكن قراءته — تأكد أن حساب Google مربوط وله صلاحية على مجلد «ملفات الجمعية».'
        : hasMore
          ? `جُلسة مزامنة سحابية: ${ingested} ملف جديد · مفهرس سابقاً ${alreadyIndexed} · متبقّي ${remaining} — اضغط المزامنة مرة أخرى.`
          : `اكتملت مزامنة عقل الشركة من Drive (سحابي، بدون ماك): ${alreadyIndexed + ingested + skipped} ملفاً من ${allFiles.length}.`,
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
