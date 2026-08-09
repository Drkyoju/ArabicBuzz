/**
 * Central Arabic copy for Telegram /help · /status · interactive menu.
 * Kept free of Bot context so unit tests can assert coverage.
 */

import { InlineKeyboard } from 'grammy'

export const TELEGRAM_SITE_URL = 'https://arabicbuzz-fooc9h.cranl.net/'

/** Deep link: site settings for one-time Google OAuth. */
export const TELEGRAM_GOOGLE_CONNECT_URL = `${TELEGRAM_SITE_URL}?section=settings`

export function buildTelegramGoogleConnectHintAr(): string {
  return [
    '🔗 ربط Google (مرة واحدة من المتصفح ثم يعمل من تيليجرام):',
    TELEGRAM_GOOGLE_CONNECT_URL,
    'بعد الربط: Drive · Gmail · Sheets · تحويل مجاني عبر Drive.',
  ].join('\n')
}

export function buildTelegramHelpAr(opts?: {
  botUsername?: string
}): string {
  const tag = opts?.botUsername ? `@${opts.botUsername}` : ''
  const linkCmd = tag ? `/link${tag}` : '/link'
  return [
    '🤖 بوت Arabic Buzz — تشغيل كامل لغرفة الموقع من تيليجرام',
    `الموقع: ${TELEGRAM_SITE_URL}`,
    '',
    '❓ هل نستغني عن الموقع تماماً؟',
    '• نعم للتشغيل اليومي: بحث · ملفات · Drive · بريد · تقويم · مهام · خطابات · محاضر · تحويل · OCR · تبليغ · إحاطة',
    '• لا لمرة واحدة: ربط Google OAuth من المتصفح',
    '• لا دائماً: سبورة tldraw · شريط TipTap · قلم PDF الحرّ (المكافئ عبر أدوات)',
    '',
    '👁 بعد /link + إيقاف Group Privacy: يسمع كل شيء (نص · صوت · ملف)',
    '• طلب («أبغى كذا» / صوت / ملف) → يُنفَّذ فوراً ويرد بالناتج — بدون منشن',
    '• الملفات والصوت تُؤرشف تلقائياً إلى Drive + غرفة الفريق عند الاستلام',
    '• إن نقص الملف: انتظار صامت (بدون «أعد الإرسال») — البحث Drive→تيليجرام→غرفة→ماك',
    '• الوكلاء: وكيل١…٨ — إنشغال الأول يوقظ التالي؛ طلب ثقيل أو «أبغا للجميع» يشغّل المتفرّغين معاً',
    '• دردشة بين الناس → صامت (استيراد الوسائط فقط)',
    '',
    '📂 المجالات (اكتب بالعربية أو استخدم أزرار القائمة):',
    '• بحث موحّد / إحاطة الصباح',
    '• Drive + خزنة الغرفة (قائمة · بحث · فتح · تعديل · رفع · رابط عرض)',
    '• تقويم الغرفة + اقتراح عند التعارض · مهام',
    '• بريد الجمعية + Gmail الشخصي (بعد الربط/الربط الشخصي)',
    '• خطابات رسمية · محضر من نقاش الغرفة',
    '• تحويل PDF/Word/Excel/PPTX · تعليق PDF محروق · OCR عربي',
    '• تبليغ عضو / المجموعة · /status حالة فقط للقراءة',
    '',
    'أمثلة:',
    '• إحاطة الصباح · ابحث في الغرفة عن …',
    '• قائمة ملفات الدرايف · جيب اللائحة · ارفع الملف إلى Drive',
    '• احجز موعد غداً ١٠ص · أضف مهمة …',
    '• خطاب شكر لـ … · محضر من الغرفة',
    '• حوّل إلى Word · علّق على PDF · OCR',
    '• أرسل لأحمد: … · بلّغ المجموعة: …',
    '• أبغا للجميع راجع الملفات · يا وكيل٢ لخّص',
    '',
    '🎤 صوت: تفريغ → إن كان طلباً يُنفَّذ فوراً',
    '',
    'أوامر:',
    `${linkCmd} — ربط المجموعة`,
    '/help — هذه القائمة + أزرار',
    '/status — حالة الربط وGoogle (قراءة فقط)',
    '/rooms · /approve · /ping',
    'في الخاص: /link account <معرّف-حساب-الموقع> لربط Gmail/Drive الشخصي',
    '',
    buildTelegramGoogleConnectHintAr(),
    '',
    'إعداد المجموعة: أضف البوت مشرفاً → /link → BotFather Group Privacy → Disable',
  ].join('\n')
}

export type HelpMenuDomain =
  | 'search'
  | 'drive'
  | 'calendar'
  | 'mail'
  | 'docs'
  | 'convert'
  | 'notify'
  | 'settings'
  | 'google'

export function buildTelegramHelpMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔎 بحث وإحاطة', 'hm:search')
    .text('📁 Drive وملفات', 'hm:drive')
    .row()
    .text('📅 تقويم ومهام', 'hm:calendar')
    .text('✉️ بريد', 'hm:mail')
    .row()
    .text('📝 خطابات ومحاضر', 'hm:docs')
    .text('🔄 تحويل وOCR', 'hm:convert')
    .row()
    .text('📣 تبليغ', 'hm:notify')
    .text('⚙️ حالة', 'hm:settings')
    .row()
    .url('🔗 اربط Google', TELEGRAM_GOOGLE_CONNECT_URL)
    .text('▶️ إحاطة الآن', 'hq:brief')
}

export function parseHelpMenuCallback(
  data: string
):
  | { kind: 'domain'; domain: HelpMenuDomain }
  | { kind: 'quick'; action: 'brief' }
  | null {
  if (data === 'hq:brief') return { kind: 'quick', action: 'brief' }
  if (data.startsWith('hm:')) {
    const domain = data.slice(3) as HelpMenuDomain
    const ok: HelpMenuDomain[] = [
      'search',
      'drive',
      'calendar',
      'mail',
      'docs',
      'convert',
      'notify',
      'settings',
      'google',
    ]
    if (ok.includes(domain)) return { kind: 'domain', domain }
  }
  return null
}

export function buildTelegramHelpDomainAr(domain: HelpMenuDomain): string {
  switch (domain) {
    case 'search':
      return [
        '🔎 بحث وإحاطة',
        '• «ابحث في الغرفة عن …» → room_search (بريد · ملفات · تقويم)',
        '• «إحاطة الصباح» / «ملخص اليوم» → owner_morning_brief',
        '• «ابحث في جوجل عن …» → web_search',
        '• عجز: research_task_tools → تنفيذ مجاني تلقائي (pdf-lib…) ثم تيليجرام؛ مدفوع فقط بعد الاستنفاد',
        '• عقل الشركة: search_knowledge_base بعد drive_sync_brain',
      ].join('\n')
    case 'drive':
      return [
        '📁 Drive وملفات الغرفة',
        '• قائمة: «اعرض ملفات الدرايف» → drive_list_files',
        '• بحث: «دور في الدرايف عن اللائحة» → drive_search_files',
        '• فتح/تعديل: brain_open_document · edit_document · brain_save_document',
        '• رفع من الخزنة: drive_upload_file · رابط عرض: drive_get_link',
        '• خزنة الغرفة: list_workspace_files · return_file',
        '⚠️ مشاركة ACL من البوت غير متاحة — انسخ webViewLink',
        '',
        buildTelegramGoogleConnectHintAr(),
      ].join('\n')
    case 'calendar':
      return [
        '📅 تقويم الغرفة ومهام (توقيت السعودية)',
        '• «احجز موعد غداً ١٠ص» → room_calendar_create (+ تنبيه تعارض واقتراح)',
        '• «كم موعد عندنا؟» · عدّل · ألغِ',
        '• «أضف مهمة …» · «حدّث المهمة» → room_tasks_*',
        '• تقويم Google الشخصي للمالك فقط — أجندة الفريق = تقويم الغرفة',
      ].join('\n')
    case 'mail':
      return [
        '✉️ البريد',
        '• بريد الجمعية: mail_search / mail_read / mail_send / mail_sync',
        '• Gmail الشخصي: gmail_* بعد ربط Google + ربط حساب تيليجرام',
        'في الخاص: /link account <UUID-حساب-الموقع>',
        '',
        buildTelegramGoogleConnectHintAr(),
      ].join('\n')
    case 'docs':
      return [
        '📝 خطابات ومحاضر',
        '• «قائمة قوالب الخطابات» → list_letter_templates',
        '• «خطاب شكر / تعميم / دعوة اجتماع …» → letter_fill_template',
        '• «محضر من نقاش الغرفة» → minutes_from_thread → ملف Word',
      ].join('\n')
    case 'convert':
      return [
        '🔄 تحويل · PDF · OCR',
        '• حوّل PDF↔Word↔Excel↔PPTX → convert_document',
        '• تعليق محروق: pdf_annotate (sticky/text/highlight/pen/rect)',
        '• استبدال عربي أدق: pdf_replace_text',
        '• مسح ضوئي عربي: arabic_ocr',
        '• ليس قلم PDF الحرّ في الموقع — إحداثيات أداة فقط',
      ].join('\n')
    case 'notify':
      return [
        '📣 تبليغ الأعضاء',
        '• «أرسل لأحمد: …» → notify_room_member',
        '• «بلّغ المجموعة: …» → رسالة للمجموعة المربوطة',
        '• خاص فقط إن ضغط المستلم Start سابقاً',
      ].join('\n')
    case 'settings':
      return [
        '⚙️ الحالة (قراءة فقط من تيليجرام)',
        '• /status — الربط · المساحة · موافقات · Google',
        '• لا تغيير إعدادات الحساب أو مفاتيح النماذج من هنا',
        '• ربط Google وتفضيلات الحساب من الموقع فقط',
        '',
        buildTelegramGoogleConnectHintAr(),
      ].join('\n')
    case 'google':
      return buildTelegramGoogleConnectHintAr()
    default:
      return buildTelegramHelpAr()
  }
}

export function buildTelegramStatusLinesAr(opts: {
  chatId: string
  inGroup: boolean
  scopeNameAr: string
  scopeId: string
  pendingCount: number
  googleHintAr?: string | null
  wakeHintAr?: string
  personalLinkAr?: string | null
  integrationsAr?: string[]
  openFileJobsCount?: number
}): string[] {
  const jobsLine =
    typeof opts.openFileJobsCount === 'number'
      ? `مهام ملفات معلّقة: ${opts.openFileJobsCount} (انتظار صامت إن نقصت البايتات)`
      : null
  return [
    'حالة Arabic Buzz عبر تيليجرام (قراءة فقط):',
    `المحادثة: ${opts.chatId}${opts.inGroup ? ' (مجموعة مربوطة)' : ' (خاص)'}`,
    `المساحة: ${opts.scopeNameAr} (${opts.scopeId})`,
    `موافقات معلّقة: ${opts.pendingCount}`,
    jobsLine,
    opts.wakeHintAr ||
      'الوكلاء وكيل١…٨: نص · صوت · ملفات · أرشفة Drive · استئناف المهام — مثل غرفة الموقع',
    opts.personalLinkAr || null,
    ...(opts.integrationsAr || []),
    opts.googleHintAr || null,
    `اربط Google إن لزم: ${TELEGRAM_GOOGLE_CONNECT_URL}`,
    `الموقع: ${TELEGRAM_SITE_URL}`,
  ].filter((x): x is string => Boolean(x))
}

export const TELEGRAM_PING_OK_AR =
  '✅ البوت يعمل بأقصى قوة. اكتب طلبك بالعربية أو /help للقائمة.'
