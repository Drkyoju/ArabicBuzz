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
  /** Show association-group shortcuts only when linked in a group. */
  inAssociationGroup?: boolean
}): string {
  const tag = opts?.botUsername ? `@${opts.botUsername}` : ''
  const linkCmd = tag ? `/link${tag}` : '/link'
  const associationBlock = opts?.inAssociationGroup
    ? [
        '',
        '🏛 اختصارات مجموعة الجمعية (هذه المجموعة مربوطة):',
        '• «إحاطة الصباح» · «أرشف المجموعة» · «ابحث في الغرفة عن …»',
        '• صوت → «مستند جاهز»: تفريغ → write_file/pdf → return_file',
        '• «احجز موعد …» → تقويم الفريق · تذكير تيليجرام ≈ ساعة قبل الموعد',
        '• لجان: /link finance | programs | board في مجموعة اللجنة',
      ]
    : []
  return [
    '🤖 بوت Arabic Buzz — تشغيل كامل لغرفة الموقع من تيليجرام',
    `الموقع: ${TELEGRAM_SITE_URL}`,
    '',
    '⚡ اختصارات (اكتبها كما هي — تنفيذ فوري ورد موجز):',
    '• إحاطة الصباح · كم موعد عندنا؟ · أرشف المجموعة',
    '• ابحث في جوجل عن … · أين تقع … · خريطة …',
    '• ابحث في الغرفة عن … · دور في الشبكة عن الملف',
    '• احجز موعد غداً ١٠ص · أضف مهمة … · ابحث في البريد عن …',
    '• أنشئ ملف مذكرة … · عدّل المرفق · OCR · ويكيبيديا … · احسب …',
    '• أرسل لأحمد: … · بلّغ المجموعة: …',
    '',
    '🏛 التدفقات اليومية:',
    '1) أرشفة — ملف/صوت يُحفظ Drive + الغرفة · أو «أرشف المجموعة»',
    '2) بحث — غرفة / ويب مجاني (DDG) / شبكة تخزين',
    '3) تلخيص — «لخّص الملف» / OCR / صوت → تفريغ ثم تنفيذ',
    '4) شبكة — ملف مفقود: Drive→تيليجرام→غرفة→ماك (بلا «أعد الإرسال»)',
    '5) صوت→مستند — زر «مستند جاهز» أو اطلب إنشاء ملف ثم إرساله',
    ...associationBlock,
    '',
    '❓ هل نستغني عن الموقع تماماً؟',
    '• نعم للتشغيل اليومي: بحث · ملفات · Drive · بريد · تقويم · مهام · خطابات · محاضر · تحويل · OCR · تبليغ · إحاطة',
    '• لا لمرة واحدة: ربط Google OAuth من المتصفح',
    '• لا دائماً: سبورة tldraw · شريط TipTap · قلم PDF الحرّ (المكافئ عبر أدوات)',
    '',
    '👁 بعد /link + إيقاف Group Privacy: يسمع كل شيء (نص · صوت · ملف)',
    '• طلب واضح → رد واحد بالنتيجة (بلا منشن وبلا أسئلة زائدة)',
    '• الملفات والصوت تُؤرشف تلقائياً إلى Drive + غرفة الفريق عند الاستلام',
    '• إن نقص الملف أو توقف hop: طابور انتظار صامت — البحث Drive→تيليجرام→غرفة→ماك',
    '• الوكلاء: وكيل١…٨ — إنشغال الأول يوقظ التالي؛ «أبغا للجميع» يشغّل المتفرّغين',
    '• دردشة بين الناس → صامت (استيراد الوسائط فقط)',
    '• ملخص أسبوعي للمجموعة (خميس الرياض) مرة واحدة — بلا تذكيرات مزعجة',
    '',
    '📂 المجالات (أزرار القائمة أو بالعربية):',
    '• بحث موحّد / ويب مجاني (DDG) / ويكيبيديا / يوتيوب / حساب / نطاق / arXiv / إحاطة',
    '• Drive + خزنة + شبكة التخزين · أرشفة المجموعة · تقويم ومهام',
    '• بريد الجمعية + Gmail · خطابات · محاضر · تحويل/OCR · تبليغ · /status',
    '',
    '🎤 صوت: تفريغ → تنفيذ فوري · زر «مستند جاهز» = STT → ملف → return_file',
    '🧠 ذاكرة: حقائق ثابتة + سياق حديث + ملخص أسبوعي لكل شات (نص+صوت+مهام+مرفقات)',
    '',
    'أوامر:',
    `${linkCmd} — ربط المجموعة`,
    '/help — هذه القائمة + أزرار',
    '/status — الربط · hops الحية (Local Bot API · جسر الماك · MTProto) · Google',
    '/rooms · /approve · /ping',
    'في الخاص: /link account <معرّف-حساب-الموقع> لربط Gmail/Drive الشخصي',
    '',
    'ℹ️ هيرميس واتساب منفصل (قدرات مجانية موازية — بلا ربط runtime/webhook مع هذا البوت).',
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
        '• «ابحث في جوجل عن …» → web_search (DuckDuckGo + ويكيبيديا + site:gov.sa — بلا مفتاح)',
        '• «أين تقع …» / «خريطة …» → geocode ثم روابط OpenStreetMap وGoogle Maps',
        '• «أنشئ ملف …» / صوت يطلب مستنداً جديداً → write_file / brain_create_document / pdf_create ثم return_file',
        '• «ويكيبيديا …» → wikipedia_lookup (ملخص المقال)',
        '• «لخّص اليوتيوب …» → youtube_transcript (كابشن مجاني إن وُجد)',
        '• «احسب …» → math_eval',
        '• «استعلم النطاق …» / DNS / WHOIS → domain_intel',
        '• «ابحث في arXiv عن …» → arxiv_search',
        '• «حوّل دولار لريال» → fx_rate',
        '• «عرّف كلمة إنجليزية …» → dictionary_lookup',
        '• «ابحث في Hacker News عن …» → hn_search',
        '• «افتح الرابط …» → web_fetch / ingest_url_to_brain (Jina Reader مجاني)',
        '• ملف مفقود: find_storage_mesh بالترتيب Drive→تيليجرام→غرفة→ماك — بلا «أعد الإرسال»',
        '• عجز: research_task_tools → تنفيذ مجاني تلقائي (pdf-lib…) ثم تيليجرام؛ مدفوع فقط بعد الاستنفاد',
        '• عقل الشركة: search_knowledge_base بعد drive_sync_brain',
        '• ذاكرة الشات: سجل هذه المحادثة يُحقن تلقائياً — يذكر الطلبات السابقة في نفس الشات',
      ].join('\n')
    case 'drive':
      return [
        '📁 Drive وملفات الغرفة',
        '• قائمة: «اعرض ملفات الدرايف» → drive_list_files',
        '• بحث: «دور في الدرايف عن اللائحة» → drive_search_files',
        '• شبكة التخزين: «دور في الشبكة عن الملف» → find_storage_mesh',
        '• أرشفة: «أرشف المجموعة» → archive_telegram_group (→ Drive + خزنة)',
        '• مرفق تيليجرام حديث: عدّل fileId مباشرة ثم return_file (بلا اشتراط Drive)',
        '• ملف جديد من الصفر: write_file / brain_create_document / pdf_create ثم return_file',
        '• فتح/تعديل Drive: brain_open_document · edit_document · brain_save_document',
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
        '• «كم موعد عندنا؟» / «مواعيد اليوم» → قائمة موجزة (مسار سريع)',
        '• «أضف مهمة …» · «حدّث المهمة» → room_tasks_*',
        '• أجندة الفريق = تقويم الغرفة فقط (room_calendar_*) — ليس تقويم Google الشخصي',
        '• تذكير تيليجرام ≈ ساعة قبل الموعد (هادئ — بلا سبام)',
      ].join('\n')
    case 'mail':
      return [
        '✉️ البريد',
        '• «ابحث في البريد عن …» / «وش في البريد؟» → mail_search / mail_read',
        '• «أرسل بريد إلى …» → mail_send (نبرة جمعية مهذبة)',
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
        '• نسخ صفحة / صفحة فاضية موجودة: pdf_duplicate_page (findEmptyPage)',
        '• إدراج صفحة بيضاء مخترعة فقط إن طُلبت صراحة: pdf_insert_blank_page',
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
        '• /status — الربط · المساحة · موافقات · hops الملفات الكبيرة · Google',
        '• hops: Local Bot API (VPS أو OrbStack) · جسر الماك · MTProto · ثم غرفة/Drive',
        '• إن ظهر hop متوقفاً: المهمة تبقى معلّقة صامتة — لا إعادة إرسال؛ البحث Drive→تيليجرام→غرفة→ماك',
        '• جسر الماك: npm run mac-hop:watchdog:force على الجهاز المستيقظ (نفق + تحديث CranL)',
        '• أرشفة يدوية: «أرشف المجموعة» → archive_telegram_group',
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
  /** Live large-file hop lines (Local Bot API / Mac / MTProto) */
  hopStatusLinesAr?: string[]
}): string[] {
  const jobsLine =
    typeof opts.openFileJobsCount === 'number'
      ? `مهام ملفات معلّقة: ${opts.openFileJobsCount} (طابور صامت — تُستأنف عند توفر البايتات أو عودة hop)`
      : null
  return [
    'حالة Arabic Buzz عبر تيليجرام (قراءة فقط):',
    `المحادثة: ${opts.chatId}${opts.inGroup ? ' (مجموعة مربوطة)' : ' (خاص)'}`,
    `المساحة: ${opts.scopeNameAr} (${opts.scopeId})`,
    `موافقات معلّقة: ${opts.pendingCount}`,
    jobsLine,
    ...(opts.hopStatusLinesAr || []),
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
