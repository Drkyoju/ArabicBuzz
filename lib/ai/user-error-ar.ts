/**
 * Map provider / transport / tool errors to short MSA for the agent workspace.
 * Keep raw English in server logs only — never paste into room posts.
 */

const ARABIC_SCRIPT = /[\u0600-\u06FF]/

/** Shared Arabic labels for tools — UI, HITL cards, tool chips. Never fall back to snake_case. */
export const TOOL_LABEL_AR: Record<string, string> = {
  send_email: 'إرسال بريد',
  gmail_search: 'بحث Gmail',
  gmail_read: 'قراءة رسالة',
  gmail_send: 'إرسال بريد Gmail',
  mail_search: 'بحث بريد الجمعية',
  mail_corpus_search: 'بحث شامل في البريد',
  mail_read: 'قراءة رسالة الجمعية',
  mail_draft_reply: 'مسودة رد بالذكاء',
  mail_send: 'إرسال بريد الجمعية',
  mail_sync: 'مزامنة بريد الجمعية',
  sheets_write: 'كتابة Google Sheets',
  sheets_read: 'قراءة Google Sheets',
  calendar_list_events: 'تقويم Google',
  calendar_create_event: 'إنشاء موعد Google',
  create_calendar_event: 'إنشاء موعد Google',
  calendar_update_event: 'تعديل موعد Google',
  calendar_delete_event: 'حذف موعد Google',
  calendar_scan_email: 'مسح بريد للمواعيد',
  calendar_find_alignment: 'مواءمة مواعيد',
  calendar_find_duplicates: 'كشف مواعيد مكررة',
  room_calendar_list: 'تقويم الغرفة',
  room_calendar_create: 'إضافة لتقويم الفريق المشترك',
  room_calendar_ingest: 'دمج مواعيد الفريق',
  room_calendar_update: 'تعديل موعد تقويم الفريق',
  room_calendar_cancel: 'إلغاء موعد من تقويم الفريق',
  room_calendar_reconcile: 'ترتيب تقويم الفريق',
  room_tasks_list: 'مهام الغرفة',
  room_tasks_create: 'إضافة مهمة للغرفة',
  room_tasks_update: 'تعديل مهمة الغرفة',
  room_tasks_reconcile: 'إعادة ترتيب مهام الغرفة',
  room_memory_list: 'ذاكرة الغرفة',
  room_memory_add: 'حفظ في ذاكرة الغرفة',
  memory_search: 'بحث الذاكرة',
  search_knowledge_base: 'قاعدة المعرفة',
  list_workspace_files: 'قائمة الملفات',
  list_files: 'قائمة الملفات',
  read_file: 'قراءة ملف',
  read_document: 'قراءة مستند',
  write_file: 'كتابة ملف',
  delete_file: 'حذف ملف',
  delete_database: 'حذف قاعدة بيانات',
  db_delete: 'حذف من قاعدة البيانات',
  brain_open_document: 'فتح ملف من عقل الشركة',
  brain_save_document: 'حفظ إلى Drive / العقل',
  brain_create_document: 'رفع ملف جديد إلى Drive',
  brain_delete_document: 'حذف ملف من Drive',
  fill_policy_audit: 'تعبئة نموذج تدقيق Excel',
  send_director_digest: 'ملخص ما ينتظر قرارك',
  owner_morning_brief: 'إحاطة الصباح',
  edit_document: 'إنشاء أو تعديل مستند',
  edit_excel: 'تعديل خلايا Excel',
  read_excel: 'قراءة Excel',
  edit_image: 'تعديل صورة',
  generate_image_edit: 'تعديل صورة توليدي',
  convert_document: 'تحويل صيغة الملف',
  convert_file: 'تحويل صيغة الملف',
  return_file: 'إرفاق ملف في الشات',
  send_message: 'تيليجرام',
  notify_room_member: 'تبليغ عضو',
  send_file: 'إرسال ملف',
  web_search: 'بحث ويب',
  web_fetch: 'جلب صفحة',
  wikipedia_lookup: 'ويكيبيديا',
  youtube_transcript: 'تفريغ يوتيوب',
  math_eval: 'حساب رياضي',
  domain_intel: 'استعلام نطاق',
  arxiv_search: 'بحث arXiv',
  fx_rate: 'سعر صرف',
  geocode: 'ترميز جغرافي',
  dictionary_lookup: 'قاموس',
  hn_search: 'Hacker News',
  research_task_tools: 'بحث أدوات/مهارات',
  drive_upload: 'رفع إلى Drive',
  drive_upload_file: 'رفع إلى Drive',
  drive_search_files: 'بحث Drive',
  drive_list_files: 'قائمة Drive',
  drive_get_link: 'رابط Drive',
  drive_sync_brain: 'مزامنة Drive → العقل',
  find_storage_mesh: 'بحث شبكة التخزين',
  archive_telegram_group: 'أرشفة تيليجرام→Drive',
  room_search: 'بحث الغرفة',
  pdf_create: 'إنشاء PDF',
  pdf_stamp: 'ختم على PDF',
  pdf_annotate: 'تعليق PDF',
  pdf_merge: 'دمج PDF',
  pdf_duplicate_page: 'نسخ صفحة PDF',
  pdf_insert_blank_page: 'إدراج صفحة فارغة',
  pdf_list_fields: 'حقول نموذج PDF',
  pdf_fill_form: 'تعبئة نموذج PDF',
  pdf_replace_text: 'استبدال نص PDF',
  arabic_ocr: 'OCR عربي',
  ingest_url_to_brain: 'سحب صفحة إلى المعرفة',
  read_decision_document: 'قراءة قرار للمستندات',
  report_room_attendance: 'تقرير أعضاء وحضور',
  browser_rpa: 'أتمتة متصفح',
  cua_computer: 'حاسوب Cua',
  trigger_workflow: 'تشغيل سير عمل',
  transfer_funds: 'تحويل مالي',
  query_db_readonly: 'استعلام قاعدة بيانات',
  list_letter_templates: 'قوالب الخطابات',
  letter_fill_template: 'تعبئة خطاب',
  minutes_from_thread: 'محضر من المحادثة',
}

/** User-facing Arabic label for a tool — never dump raw snake_case. */
export function toolLabelAr(toolName: string | undefined | null): string {
  const name = String(toolName || '').trim()
  if (!name) return 'إجراء'
  if (TOOL_LABEL_AR[name]) return TOOL_LABEL_AR[name]
  if (ARABIC_SCRIPT.test(name)) return name
  // Unknown English / snake_case — keep generic.
  if (/^[a-z][a-z0-9_]*$/i.test(name)) return 'إجراء تقني'
  return 'إجراء'
}

/**
 * Map tool / document / convert errors to short MSA.
 * Strips ToUnicode / extract_source / engine ids from user-facing text.
 */
export function mapToolErrorAr(raw: string | undefined | null): string {
  const text = (raw || '').trim()
  if (!text) return 'تعذّر إكمال الإجراء — حاول مرة أخرى.'

  const lower = text.toLowerCase()

  if (
    /tounicode|mojibake|طلاسم|طبقة الترميز|corrupt.*arabic|broken.*unicode/i.test(
      lower + text
    )
  ) {
    return 'تعذّر استخراج نص عربي نظيف من الملف (ترميز النص تالف أو مشوّه). لم نُنشئ ملفاً حتى لا يصلك طلاسم — جرّب OCR صفحة بصفحة أو اربط Google Drive من الإعدادات.'
  }

  if (
    /extract_source|pdf-parse|read-pages|free-rebuild|engine[=:]|ocr.?cascade/i.test(
      lower
    )
  ) {
    return 'تعذّر تحويل أو استخراج النص من الملف بجودة مقبولة. جرّب مساراً آخر أو ارفع نسخة أوضح.'
  }

  if (/unknown tool|tool not found|unknown tool:/i.test(lower)) {
    return 'الأداة غير متاحة حالياً — أعد صياغة الطلب أو اختر وكيلاً آخر.'
  }

  if (
    /brain_open_document|list_workspace_files|convert_document|delete_file/i.test(
      text
    ) &&
    !ARABIC_SCRIPT.test(text)
  ) {
    return 'تعذّر العثور على الملف أو تنفيذه — افتحه من ملفات الفريق أو عقل الشركة ثم أعد المحاولة.'
  }

  if (ARABIC_SCRIPT.test(text)) {
    const cleaned = text
      .replace(
        /\b(extract_source(?:_fixed)?|ToUnicode|pdf-parse-safe|read-pages|free-rebuild|brain_open_document|list_workspace_files|convert_document)\b/gi,
        ''
      )
      .replace(/\s{2,}/g, ' ')
      .trim()
    const out = cleaned || text
    return out.length > 280 ? `${out.slice(0, 277)}…` : out
  }

  if (/rate limit|too many requests|429|quota/i.test(lower)) {
    return 'تجاوزنا حد الطلبات مؤقتاً — انتظر قليلاً ثم أعد المحاولة.'
  }
  if (/timeout|etimedout|aborted|deadline|timed out/i.test(lower)) {
    return 'انتهت مهلة الإجراء — اختصر الطلب أو قسّمه ثم أعد المحاولة.'
  }

  return 'تعذّر إكمال الإجراء — حاول مرة أخرى.'
}

export function mapChatErrorAr(
  raw: string | undefined | null,
  opts?: { httpStatus?: number; code?: string }
): string {
  const code = (opts?.code || '').trim().toUpperCase()
  if (code === 'AUTH_REQUIRED') {
    return 'سجّل الدخول للإرسال، ثم أعد المحاولة.'
  }

  const text = (raw || '').trim()
  if (!text) {
    if (opts?.httpStatus && opts.httpStatus >= 500) {
      return 'تعذّر الرد من الخادم — حاول بعد لحظات.'
    }
    if (opts?.httpStatus === 429) {
      return 'الطلب كثير حالياً — انتظر قليلاً ثم أعد المحاولة.'
    }
    if (opts?.httpStatus && opts.httpStatus >= 400) {
      return `تعذّر الرد (رمز ${opts.httpStatus}).`
    }
    return 'تعذّر الرد — حاول مرة أخرى.'
  }

  // Document / tool English often arrives via chat path — map first.
  if (
    /tounicode|extract_source|unknown tool|mojibake/i.test(text) &&
    !ARABIC_SCRIPT.test(text)
  ) {
    return mapToolErrorAr(text)
  }

  // Already Arabic (or mostly) — keep as-is, lightly trim; scrub tool tokens.
  if (ARABIC_SCRIPT.test(text) && !/Unknown model|rate limit|ECONN|ETIMEDOUT/i.test(text)) {
    const cleaned = text
      .replace(
        /\b(extract_source(?:_fixed)?|ToUnicode|pdf-parse-safe|read-pages|free-rebuild)\b/gi,
        ''
      )
      .replace(/\s{2,}/g, ' ')
      .trim()
    const out = cleaned || text
    return out.length > 280 ? `${out.slice(0, 277)}…` : out
  }

  const lower = text.toLowerCase()

  if (/unknown model|model id|model_not_found|invalid model/i.test(text)) {
    return 'النموذج غير معروف أو غير مفعّل — اختر نموذجاً آخر من إعدادات الوكيل.'
  }
  if (
    /rate limit|too many requests|429|quota|resource_exhausted/i.test(lower)
  ) {
    return 'تجاوزنا حد الطلبات مؤقتاً — انتظر قليلاً ثم أعد المحاولة.'
  }
  if (
    /timeout|etimedout|aborted|deadline|timed out/i.test(lower) ||
    opts?.httpStatus === 504
  ) {
    return 'انتهت مهلة الرد — اختصر الطلب أو قسّمه؛ إن كان ملفاً معلّقاً سيُستأنف تلقائياً دون إعادة إرسال.'
  }
  if (
    /unauthorized|invalid.?api.?key|authentication|401|403|forbidden/i.test(
      lower
    )
  ) {
    return 'مفتاح النموذج غير صالح أو منتهٍ — راجع إعدادات المزود.'
  }
  if (/econnrefused|enotfound|network|fetch failed|502|503/i.test(lower)) {
    return 'تعذّر الاتصال بمزوّد الذكاء — تحقق من الشبكة أو أعد المحاولة.'
  }
  if (/context.?length|too long|maximum.*token|payload too large/i.test(lower)) {
    return 'الطلب طويل جداً للنموذج — اختصر الرسالة أو قلّل المرفقات.'
  }
  if (/content.?policy|safety|blocked|moderation/i.test(lower)) {
    return 'المزوّد رفض المحتوى لأسباب السلامة — أعد صياغة الطلب.'
  }

  // Generic: never dump English stack / provider noise into the feed.
  if (opts?.httpStatus && opts.httpStatus >= 400) {
    return `تعذّر الرد (رمز ${opts.httpStatus}).`
  }
  return 'تعذّر إكمال الرد — حاول مرة أخرى أو غيّر النموذج.'
}

export function unknownModelMessageAr(modelId: string): string {
  const id = (modelId || '').trim() || '؟'
  return `النموذج «${id}» غير معروف — اختر نموذجاً من قائمة الوكلاء.`
}

/** Count noun for tool result chips — never bare digits. */
function toolCountUnitAr(toolName: string, count: number): string {
  const n = String(toolName || '')
  const one = count === 1
  if (/calendar|event/i.test(n)) return one ? 'موعد' : 'مواعيد'
  if (/task/i.test(n)) return one ? 'مهمة' : 'مهام'
  if (/mail|gmail|message/i.test(n) && !/send_message/i.test(n)) {
    return one ? 'رسالة' : 'رسائل'
  }
  if (/memor/i.test(n)) return one ? 'ذكرى' : 'ذكريات'
  if (/file|document|drive|brain|pdf|excel|sheet/i.test(n)) {
    return one ? 'ملف' : 'ملفات'
  }
  if (/search|web|result|arxiv|hn_/i.test(n)) return one ? 'نتيجة' : 'نتائج'
  return one ? 'عنصر' : 'عناصر'
}

/** Outcome verb when the tool gave no useful Arabic body. */
function toolDefaultOutcomeAr(toolName: string): string {
  const n = String(toolName || '')
  if (/send|notify/i.test(n)) return 'أُرسل'
  if (/create|add|ingest|write|save|upload|fill/i.test(n)) return 'حُفظ'
  if (/update|edit|replace|reconcile/i.test(n)) return 'عُدّل'
  if (/delete|cancel|remove/i.test(n)) return 'أُلغي'
  if (/search|list|read|fetch|lookup|scan|find/i.test(n)) return 'وُجد'
  if (/draft/i.test(n)) return 'مسودة جاهزة'
  if (/convert|ocr/i.test(n)) return 'اكتمل'
  return 'اكتمل'
}

/**
 * Short MSA success / status line for tool chips in the room feed.
 * Prefer tool messageAr when already Arabic and concise; otherwise normalize.
 */
export function mapToolSuccessAr(
  toolName: string | undefined | null,
  raw: string | undefined | null,
  opts?: { count?: number; ok?: boolean; pending?: boolean }
): string {
  const label = toolLabelAr(toolName)
  const text = (raw || '').trim()
  const count = opts?.count

  if (opts?.pending || /paused|pending.?approv|بانتظار موافقة/i.test(text)) {
    return `${label}: بانتظار موافقة`
  }

  if (typeof count === 'number' && Number.isFinite(count)) {
    if (count === 0) return `${label}: لا نتائج`
    return `${label}: ${count} ${toolCountUnitAr(String(toolName || ''), count)}`
  }

  if (
    !text ||
    text === 'تم الاستدعاء' ||
    text === 'تم بنجاح' ||
    text === 'تم' ||
    text === 'ok' ||
    text === 'OK'
  ) {
    return `${label}: ${toolDefaultOutcomeAr(String(toolName || ''))}`
  }

  // Already short Arabic — keep, lightly trim.
  if (ARABIC_SCRIPT.test(text) && text.length <= 90) {
    // Strip redundant tool name prefix if present
    const stripped = text
      .replace(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：·]?\\s*`), '')
      .trim()
    const body = stripped || text
    return body.length <= 72 ? `${label}: ${body}` : `${label}: ${body.slice(0, 69)}…`
  }

  if (ARABIC_SCRIPT.test(text)) {
    return `${label}: ${text.slice(0, 69)}${text.length > 69 ? '…' : ''}`
  }

  // English / technical success dumps — never show raw.
  if (/sent|ok|success|created|updated|done|saved/i.test(text)) {
    return `${label}: ${toolDefaultOutcomeAr(String(toolName || ''))}`
  }
  return `${label}: ${toolDefaultOutcomeAr(String(toolName || ''))}`
}

/** Body-only line for chips that already show labelAr separately. */
export function toolChipBodyAr(summaryAr: string, labelAr: string): string {
  const s = (summaryAr || '').trim()
  const label = (labelAr || '').trim()
  if (!s) return ''
  if (!label) return s
  const stripped = s
    .replace(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：·]?\\s*`), '')
    .trim()
  return stripped || s
}
