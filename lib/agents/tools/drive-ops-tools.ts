/**
 * Drive list / search / link helpers for agents (scopes: drive.readonly + drive.file).
 * Share ACL creation is NOT available — return webViewLink only.
 */

import {
  classifyDriveAccessError,
  findDriveBrainFile,
  listDriveFolderFiles,
  uploadDriveBinaryFile,
} from '@/lib/google/drive'
import { readWorkspaceFile } from '@/lib/documents/workspace'

function requireGoogleUser(params: Record<string, unknown>) {
  const userId = String(params.userId || '').trim()
  if (!userId || userId === 'engine' || userId === 'local-owner') {
    throw new Error(
      'يلزم ربط Google من الإعدادات مرة واحدة ثم إعادة المحاولة من تيليجرام: https://arabicbuzz-fooc9h.cranl.net/?section=settings — اضغط «اربط Google».'
    )
  }
  return userId
}

export async function executeDriveListFiles(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireGoogleUser(params)
  try {
    const files = await listDriveFolderFiles(userId, {
      folderId: params.folderId ? String(params.folderId) : undefined,
      recursive: params.recursive !== false,
      pageSize: 100,
    })
    const limit = Math.min(Math.max(Number(params.limit) || 40, 5), 80)
    const slice = files.slice(0, limit)
    return {
      ok: true,
      count: files.length,
      shown: slice.length,
      files: slice.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink || null,
      })),
      messageAr:
        files.length === 0
          ? 'مجلد ملفات الجمعية فارغ أو غير قابل للقراءة بهذا الحساب.'
          : `عُثر على ${files.length} ملفاً في Drive (عرض ${slice.length}). افتح بـ brain_open_document أو drive_search_files.`,
      shareNoteAr:
        'مشاركة ACL غير متاحة من البوت (صلاحيات OAuth الحالية). استخدم رابط العرض webViewLink.',
    }
  } catch (e) {
    const c = classifyDriveAccessError(e)
    throw new Error(c.messageAr)
  }
}

export async function executeDriveSearchFiles(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireGoogleUser(params)
  const query = String(
    params.queryAr || params.query || params.name || ''
  ).trim()
  if (!query) throw new Error('مرّر queryAr للبحث في مجلد ملفات الجمعية.')

  try {
    const { getFileSourceLock } = await import('@/lib/files/file-source-policy')
    if (getFileSourceLock()?.lockedTelegramFileIds.length) {
      throw new Error(
        'يوجد مرفق تيليجرام في هذا الطلب — ممنوع البحث في Drive كبديل. نفّذ على fileId المرفق فقط.'
      )
    }
    const files = await listDriveFolderFiles(userId, { recursive: true })
    const lower = query.toLowerCase()
    // List matches for discovery only — opening still requires exact id/name (no fuzzy open).
    const hits = files
      .filter((f) => {
        const n = f.name.toLowerCase()
        const base = n.replace(/\.[^.]+$/, '')
        return n === lower || base === lower.replace(/\.[^.]+$/, '')
      })
      .slice(0, 25)
    return {
      ok: true,
      queryAr: query,
      count: hits.length,
      files: hits.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        webViewLink: f.webViewLink || null,
      })),
      messageAr:
        hits.length > 0
          ? `نتائج Drive لـ «${query}»: ${hits.length}.`
          : `لا نتائج في مجلد الجمعية لـ «${query}». جرّب drive_sync_brain ثم search_knowledge_base.`,
    }
  } catch (e) {
    const c = classifyDriveAccessError(e)
    throw new Error(c.messageAr)
  }
}

/** Upload a room workspace file into the association Drive folder. */
export async function executeDriveUploadFile(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireGoogleUser(params)
  const scopeId = String(params.scopeId || 'shared-demo')
  const fileId = String(params.fileId || '').trim()
  if (!fileId) throw new Error('مرّر fileId من خزنة الغرفة للرفع إلى Drive.')

  const found = await readWorkspaceFile(scopeId, fileId)
  if (!found) throw new Error('الملف غير موجود في خزنة الغرفة.')

  try {
    const meta = await uploadDriveBinaryFile(userId, {
      name: found.meta.originalName,
      buffer: found.buffer,
      mimeType: found.meta.mimeType || 'application/octet-stream',
      folderId: params.folderId ? String(params.folderId) : undefined,
    })
    return {
      ok: true,
      driveFileId: meta.id,
      name: meta.name,
      webViewLink: meta.webViewLink || null,
      messageAr: `رُفع «${meta.name}» إلى مجلد ملفات الجمعية على Drive.`,
      shareNoteAr:
        'لمشاركة أوسع: افتح الرابط من Drive وشارك يدوياً — البوت لا يغيّر ACL (صلاحية drive.file فقط).',
    }
  } catch (e) {
    const c = classifyDriveAccessError(e)
    throw new Error(c.messageAr)
  }
}

/** Resolve a Drive file meta + share link (no ACL mutate). */
export async function executeDriveGetLink(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireGoogleUser(params)
  const ref = String(
    params.driveFileId || params.fileId || params.name || params.queryAr || ''
  ).trim()
  if (!ref) throw new Error('مرّر اسم الملف أو معرّف Drive.')

  try {
    const meta = await findDriveBrainFile(userId, ref)
    if (!meta) {
      throw new Error(`لم يُعثر على «${ref}» في مجلد ملفات الجمعية.`)
    }
    return {
      ok: true,
      driveFileId: meta.id,
      name: meta.name,
      mimeType: meta.mimeType,
      webViewLink: meta.webViewLink || null,
      messageAr: meta.webViewLink
        ? `رابط العرض: ${meta.webViewLink}`
        : `الملف «${meta.name}» موجود — لا رابط عرض متاح.`,
      shareNoteAr:
        'إنشاء مشاركات جديدة يحتاج صلاحية Drive أوسع وغير مفعّلة. انسخ الرابط وشارك يدوياً إن لزم.',
    }
  } catch (e) {
    const c = classifyDriveAccessError(e)
    throw new Error(c.messageAr)
  }
}
