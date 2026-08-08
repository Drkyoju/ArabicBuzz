/**
 * HARD RULE — file sources for agents (Telegram + website room):
 * 1) Telegram attachment in this conversation
 * 2) Website غرفة الفريق / room vault
 * 3) Google Drive «عقل الشركة» — only files already in the linked brain folder
 *
 * FORBIDDEN: external files, fuzzy/partial name substitutes, web downloads as
 * stand-ins, inventing nearest-similar Drive docs the user did not send/upload.
 *
 * When a Telegram attachment lock is active: ONLY that fileId (and derivatives
 * created in the same turn) may be used. Missing bytes → Arabic failure, never
 * pick another file.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export const FILE_SOURCE_POLICY_AR = [
  'قاعدة الملفات الصارمة:',
  '1) مرفق تيليجرام في هذه المحادثة فقط، أو',
  '2) ملفات غرفة الفريق على الموقع، أو',
  '3) ملفات عقل الشركة على Google Drive التي رُفعت مسبقاً هناك.',
  'ممنوع: أي ملف خارجي، تطابق تقريبي بالاسم، تنزيل من الويب كبديل، أو اختيار مستند Drive لم يرسله/يرفعه المستخدم.',
].join(' ')

export type FileSourceLock = {
  /** Original Telegram-ingested vault file ids for this turn. */
  lockedTelegramFileIds: string[]
  lockedNames: string[]
  /** Grows when tools save outputs derived in this turn. */
  allowedFileIds: Set<string>
}

const storage = new AsyncLocalStorage<FileSourceLock>()

export function runWithFileSourceLock<T>(
  lock: {
    lockedTelegramFileIds: string[]
    lockedNames?: string[]
  },
  fn: () => Promise<T>
): Promise<T> {
  const ids = lock.lockedTelegramFileIds.filter(Boolean)
  const ctx: FileSourceLock = {
    lockedTelegramFileIds: ids,
    lockedNames: lock.lockedNames || [],
    allowedFileIds: new Set(ids),
  }
  return storage.run(ctx, fn)
}

export function getFileSourceLock(): FileSourceLock | null {
  return storage.getStore() || null
}

/** Allow a newly saved vault file (edit/convert output) under an active lock. */
export function allowDerivedFileId(fileId: string): void {
  const lock = getFileSourceLock()
  if (!lock || !fileId) return
  lock.allowedFileIds.add(fileId)
}

export function parseTelegramAttachmentFileIds(text: string): {
  fileIds: string[]
  names: string[]
} {
  const fileIds: string[] = []
  const names: string[] = []
  const seen = new Set<string>()
  const patterns = [
    /ملف مرفوع من تيليجرام:\s*«([^»]+)»\s*\(fileId=([^,\s)]+)/g,
    /مرفق بالرد من تيليجرام:\s*«([^»]+)»\s*\(fileId=([^,\s)]+)/g,
    /صورة بالرد من تيليجرام:\s*«([^»]+)»\s*\(fileId=([^,\s)]+)/g,
    /fileId[=:]([a-zA-Z0-9_-]{8,})/g,
  ]
  for (const re of patterns) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      if (m.length >= 3 && m[2]) {
        const name = m[1]
        const id = m[2]
        if (!seen.has(id)) {
          seen.add(id)
          fileIds.push(id)
          if (name) names.push(name)
        }
      } else if (m[1] && !seen.has(m[1])) {
        // fileId= only
        if (/^[a-zA-Z0-9_-]{8,}$/.test(m[1])) {
          seen.add(m[1])
          fileIds.push(m[1])
        }
      }
    }
  }
  return { fileIds, names }
}

const DRIVE_OPEN_TOOLS = new Set([
  'brain_open_document',
  'drive_search_files',
  'drive_list_files',
  'drive_get_link',
  'ingest_url_to_brain',
  'read_decision_document',
])

const FILE_INPUT_TOOLS = new Set([
  'read_document',
  'edit_document',
  'convert_document',
  'convert_file',
  'return_file',
  'read_excel',
  'edit_excel',
  'edit_image',
  'generate_image_edit',
  'pdf_stamp',
  'pdf_annotate',
  'pdf_merge',
  'pdf_replace_text',
  'pdf_fill_form',
  'pdf_list_fields',
  'arabic_ocr',
  'delete_file',
  'read_file',
  'fill_policy_audit',
  'brain_save_document',
])

export function assertFileSourceToolAllowed(toolName: string): void {
  const lock = getFileSourceLock()
  if (!lock?.lockedTelegramFileIds.length) return
  if (DRIVE_OPEN_TOOLS.has(toolName)) {
    throw new Error(
      [
        'يوجد مرفق تيليجرام في هذا الطلب — ممنوع فتح/بحث Drive أو جلب ملف خارجي كبديل.',
        `نفّذ فقط على مرفق تيليجرام: ${lock.lockedNames[0] ? `«${lock.lockedNames[0]}» ` : ''}(fileId=${lock.lockedTelegramFileIds[0]}).`,
        'إن تعذّر قراءة البايتات: استخدم الملف المحفوظ في خزنة الغرفة/المهمة المعلّقة — ممنوع طلب إعادة الإرسال إن وُجدت أي نسخة محفوظة.',
      ].join(' ')
    )
  }
}

/**
 * Exact id / exact filename / unique exact basename only.
 * Never partial includes (e.g. «معلم» → «دليل معلم الأحياء»).
 */
export function matchWorkspaceFileExact<
  T extends { id: string; originalName: string },
>(files: T[], fileIdOrName: string): T | null {
  const q = fileIdOrName.trim()
  if (!q) return null
  const byId = files.find((f) => f.id === q)
  if (byId) return byId
  const lower = q.toLowerCase()
  const exactName = files.filter((f) => f.originalName.toLowerCase() === lower)
  if (exactName.length === 1) return exactName[0]!
  const base = lower.replace(/\.[^.]+$/, '')
  const byBase = files.filter(
    (f) => f.originalName.toLowerCase().replace(/\.[^.]+$/, '') === base
  )
  if (byBase.length === 1) return byBase[0]!
  return null
}

export function assertResolvedFileAllowed(
  file: { id: string; originalName: string },
  ref: string
): void {
  const lock = getFileSourceLock()
  if (!lock?.lockedTelegramFileIds.length) return
  if (lock.allowedFileIds.has(file.id)) return
  throw new Error(
    [
      `ممنوع استبدال مرفق تيليجرام بملف آخر («${file.originalName}»).`,
      `الطلب مربوط بالمرفق فقط: ${lock.lockedNames[0] ? `«${lock.lockedNames[0]}» ` : ''}fileId=${lock.lockedTelegramFileIds.join('، ')}.`,
      `المرجع المطلوب كان «${ref}» — استرجع من الخزنة/المهمة المعلّقة إن لزم؛ لن نختار بديلاً بالاسم.`,
    ].join(' ')
  )
}

export function telegramAttachmentMissingAr(name?: string): string {
  return [
    'تعذّر الوصول لبايتات مرفق تيليجرام',
    name ? `«${name}»` : '',
    '— سأبحث في خزنة الغرفة وعقل الشركة والمهمة المعلّقة بنفس الاسم تماماً.',
    'لن أطلب إعادة الإرسال إن وُجدت أي نسخة محفوظة، ولن أستخدم ملفاً آخر بالتشابه في الاسم.',
  ]
    .filter(Boolean)
    .join(' ')
}

export function formatFileSourceLockHint(lock: {
  lockedTelegramFileIds: string[]
  lockedNames?: string[]
}): string {
  if (!lock.lockedTelegramFileIds.length) return ''
  const name = lock.lockedNames?.[0]
  return [
    '[قفل مرفق تيليجرام — إلزامي]',
    FILE_SOURCE_POLICY_AR,
    `الملف الوحيد المسموح كمصدر: ${name ? `«${name}» ` : ''}fileId=${lock.lockedTelegramFileIds[0]}.`,
    'ممنوع brain_open_document / drive_search_files / أي تطابق تقريبي بالاسم («معلم» إلخ).',
    'إن فشل قراءة هذا fileId: أوقف واعتذر بالعربية — لا تختار ملفاً آخر.',
  ].join('\n')
}
