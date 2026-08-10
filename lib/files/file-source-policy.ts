/**
 * HARD RULE — file sources for agents (Telegram + website room):
 *
 * Golden rule: a brand-new attachment in THIS message is the working copy —
 * execute (edit/summarize/convert/derive) and return_file. Never require Drive,
 * room history, or a prior sighting.
 *
 * Search order only when NO attachment is in the turn:
 * 1) Telegram mirror / recent TG media
 * 2) Website غرفة الفريق / room vault
 * 3) Google Drive «عقل الشركة»
 * 4) Mac bridge
 *
 * FORBIDDEN: «مو بالدرايف», «ما أعرف وين», resend spam, hanging, external files,
 * fuzzy substitutes, inventing nearest-similar Drive docs.
 *
 * When a Telegram attachment lock is active: ONLY that fileId (and derivatives
 * created in the same turn) may be used. Missing bytes → mesh resume, never
 * pick another file by fuzzy name.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

/** One-liner injected into cascade / system / short-intent. */
export const TELEGRAM_FILE_GOLDEN_RULE_AR =
  'قاعدة ذهبية: مرفق جديد في الرسالة = نسخة العمل فوراً. نفّذ المطلوب (تعديل/تلخيص/تحويل/إنشاء مشتق) وأرجع الملف أو النتيجة بـ return_file. لا تشترط Drive ولا غرفة ولا تاريخ سابق. ممنوع «مو بالدرايف» / «ما أعرف وين» / «أعد الإرسال» / الصمت.'

export const FILE_SOURCE_POLICY_AR = [
  TELEGRAM_FILE_GOLDEN_RULE_AR,
  'إن لم يوجد مرفق في هذه الرسالة — ابحث بهذا الترتيب:',
  '1) مرآة مرفقات تيليجرام / ذاكرة حيّة، ثم',
  '2) ملفات غرفة الفريق على الموقع، ثم',
  '3) عقل الشركة (Google Drive)، ثم',
  '4) جسر الماك إن وُجد.',
  'ممنوع طلب إعادة الإرسال إن وُجدت أي بايتات. ممنوع: ملف خارجي، تطابق تقريبي، أو دليل أحياء بدل «المعلم الأول» (السيرة).',
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
    '— أبحث تلقائياً في Drive ثم مرآة تيليجرام ثم غرفة الفريق ثم الماك بنفس الاسم/المرادف (بدون أحياء).',
    'لن أطلب إعادة الإرسال إن وُجدت أي نسخة؛ المهمة تبقى معلّقة صامتة حتى يظهر الملف.',
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
    '[قفل مرفق تيليجرام — إلزامي — حتى لو أول مرة ولم يُرَ في Drive]',
    TELEGRAM_FILE_GOLDEN_RULE_AR,
    FILE_SOURCE_POLICY_AR,
    `الملف الوحيد المسموح كمصدر: ${name ? `«${name}» ` : ''}fileId=${lock.lockedTelegramFileIds[0]}.`,
    'ممنوع brain_open_document / drive_search_files / اشتراط الوجود في Drive أو الغرفة.',
    'إن تعذّرت البايتات: find_storage_mesh ثم استأنف — ممنوع «أعد الإرسال» إن وُجدت أي نسخة؛ ممنوع اختيار ملف آخر بالتشابه.',
  ].join('\n')
}

/** Dumb refusals the bot must never ship (Drive-only / lost / resend spam). */
export function looksLikeDumbFileRefusalAr(text: string): boolean {
  const t = String(text || '').trim()
  if (!t || t.length > 900) return false
  const refusal =
    /(?:مو\s*(?:بال)?درايف|مو\s*موجود\s*(?:في\s*)?(?:ال)?درايف|غير\s*موجود\s*(?:في\s*)?(?:ال)?درايف|لازم\s*(?:يكون\s*)?(?:على|في)\s*(?:ال)?درايف|فقط\s*(?:إن|إذا)\s*(?:كان\s*)?(?:على|في)\s*(?:ال)?درايف|ما\s*أعرف\s*وين|ما\s*عرفت\s*وين|وين\s*(?:الملف|هو)\s*\?|أعد\s*(?:الإرسال|ارساله|إرسال)|أرسله\s*مرة\s*أخرى|ارفعه\s*(?:إلى|على)\s*(?:ال)?درايف\s*أولا|not\s*(?:on|in)\s*drive|resend\s*(?:the\s*)?file)/iu.test(
      t
    )
  if (!refusal) return false
  // Success deliveries are never refusals even if they mention Drive.
  if (
    /(?:تم\s*(?:ال|)|أُنشئ|أنشأت|أضفت|وجدت|return_file|webViewLink|أُرسل|ارسلت)/iu.test(
      t
    )
  ) {
    return false
  }
  return true
}
