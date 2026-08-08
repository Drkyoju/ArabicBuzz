/**
 * Which tool results should be pushed to Telegram as documents/photos.
 * Silent group mode still delivers these (result, not chatty reply).
 */

/** Tools that mean «here is a file for the user». */
export const TELEGRAM_DELIVER_ATTACHMENT_TOOLS = new Set([
  'return_file',
  'edit_document',
  'edit_excel',
  'convert_document',
  'convert_file',
  'write_file',
  'pdf_create',
  'pdf_stamp',
  'pdf_annotate',
  'pdf_merge',
  'pdf_duplicate_page',
  'pdf_insert_blank_page',
  'pdf_fill_form',
  'pdf_replace_text',
  'edit_image',
  'generate_image_edit',
  'brain_save_document',
  'brain_create_document',
  'fill_policy_audit',
  'send_file',
])

/** Open-from-Drive / list reads — deliver only when user asked for the file itself. */
export const TELEGRAM_OPEN_ATTACHMENT_TOOLS = new Set([
  'brain_open_document',
  'read_document',
  'read_excel',
  'read_file',
])

const FILE_DELIVER_PROMPT_RE =
  /(?:أرسل|ارسل|جيب|هات|ور[ّ]?ي?ني|وريني|نز[ّ]?ل|حم[ّ]?ل|عطني|أبغ[اى]\s*(?:ال)?ملف|ابي\s*(?:ال)?ملف|أريد\s*(?:ال)?ملف|اريد\s*(?:ال)?ملف|أبغ[اى]\s*(?:ال)?(?:لائح|مستند|عقد)|ابغى\s*(?:ال)?(?:ملف|لائح|مستند|عقد)|أرسل\s*(?:ال)?ملف|ارسل\s*(?:ال)?ملف|هات\s*(?:ال)?لائح|عطني\s*(?:ال)?لائح|أرسله|ارسليه|ابغى\s*الملف|افتح\s*(?:لي\s*)?(?:ال)?ملف|من\s*(?:ال)?درايف|من\s*(?:ال)?عقل|send\s*(?:me\s*)?(?:the\s*)?file|download)/iu

/**
 * Explicit «send me the file» / Drive-brain fetch cues in the user prompt.
 */
export function shouldForceFileDelivery(prompt?: string): boolean {
  return FILE_DELIVER_PROMPT_RE.test(prompt || '')
}

/**
 * In silent group mode: send tool attachments when they are deliverables,
 * or when the turn is a file request / explicit «أرسل الملف».
 */
export function shouldDeliverSilentAttachment(opts: {
  toolName?: string
  workKind?: string
  prompt?: string
}): boolean {
  const tool = (opts.toolName || '').trim()
  const forcePrompt = shouldForceFileDelivery(opts.prompt)
  if (tool && TELEGRAM_DELIVER_ATTACHMENT_TOOLS.has(tool)) return true
  if (opts.workKind === 'file') {
    if (!tool || TELEGRAM_OPEN_ATTACHMENT_TOOLS.has(tool)) return true
    if (TELEGRAM_DELIVER_ATTACHMENT_TOOLS.has(tool)) return true
    // Unknown tool with attachments on a file turn — still deliver.
    return true
  }
  if (tool && TELEGRAM_OPEN_ATTACHMENT_TOOLS.has(tool)) {
    // brain_open_document / reads: deliver on explicit file ask or Drive/brain cue.
    return forcePrompt
  }
  // No tool name (assistant path): deliver on file turns or explicit ask.
  if (!tool) {
    return opts.workKind === 'file' || forcePrompt
  }
  return false
}

/** Telegram Bot API soft limit for sendDocument / sendPhoto payloads. */
export const TELEGRAM_MAX_UPLOAD_BYTES = 48 * 1024 * 1024

/**
 * Cloud Bot API download hard cap (~20 MiB). Larger files need Local Bot API
 * server, or user upload to room/Drive. We surface this clearly — never silent.
 */
export const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024

export function telegramFileTooLargeAr(opts: {
  fileName?: string
  sizeBytes?: number
  limitBytes?: number
}): string {
  const limit = opts.limitBytes ?? TELEGRAM_MAX_DOWNLOAD_BYTES
  const sizeMb =
    opts.sizeBytes != null
      ? (opts.sizeBytes / (1024 * 1024)).toFixed(1)
      : null
  const limitMb = (limit / (1024 * 1024)).toFixed(0)
  const name = opts.fileName ? `«${opts.fileName}»` : 'المرفق'
  return [
    `سجّلت ${name} — تنزيل بوت تيليجرام السحابي محدود (~${limitMb} م.ب)${
      sizeMb ? ` والملف ≈ ${sizeMb} م.ب` : ''
    }.`,
    'سأكمل المهمة عبر ملفات غرفة الفريق أو عقل الشركة (Drive) عند توفر البايتات بنفس الاسم تماماً، ثم أرسل الناتج هنا.',
    'لا حاجة لإعادة إرسال الملف عبر تيليجرام مراراً. لن أستبدل ملفك بملف آخر بالتشابه في الاسم.',
  ].join('\n')
}

/** True when error text is the TG download-size / missing-bytes class. */
export function isTelegramDownloadLimitError(err: unknown): boolean {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : ''
  return /حد التنزيل|تنزيل بوت تيليجرام|TELEGRAM_MAX_DOWNLOAD|20 م\.ب|سجّلت .*تنزيل بوت|مسار التنزيل الموسّع|Bot API محلي/i.test(
    raw
  )
}
