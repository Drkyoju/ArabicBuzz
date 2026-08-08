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
  'pdf_merge',
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
  /(?:أرسل|ارسل|جيب|هات|ور[ّ]?ني|وريني|نز[ّ]?ل|حم[ّ]?ل|عطني|أبغ[اى]\s*(?:ال)?ملف|ابي\s*(?:ال)?ملف|أريد\s*(?:ال)?ملف|اريد\s*(?:ال)?ملف|أرسله|ارسليه|ابغى\s*الملف|افتح\s*(?:لي\s*)?(?:ال)?ملف|send\s*(?:me\s*)?(?:the\s*)?file|download)/iu

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
  if (tool && TELEGRAM_DELIVER_ATTACHMENT_TOOLS.has(tool)) return true
  if (opts.workKind === 'file') {
    if (!tool || TELEGRAM_OPEN_ATTACHMENT_TOOLS.has(tool)) return true
    if (TELEGRAM_DELIVER_ATTACHMENT_TOOLS.has(tool)) return true
    // Unknown tool with attachments on a file turn — still deliver.
    return true
  }
  if (tool && TELEGRAM_OPEN_ATTACHMENT_TOOLS.has(tool)) {
    return FILE_DELIVER_PROMPT_RE.test(opts.prompt || '')
  }
  // No tool name (assistant path): deliver on file turns or explicit ask.
  if (!tool) {
    return (
      opts.workKind === 'file' || FILE_DELIVER_PROMPT_RE.test(opts.prompt || '')
    )
  }
  return false
}

/** Telegram Bot API soft limit for sendDocument / sendPhoto payloads. */
export const TELEGRAM_MAX_UPLOAD_BYTES = 48 * 1024 * 1024
