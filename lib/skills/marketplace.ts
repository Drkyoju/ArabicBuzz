import { isCoreAutoSkill } from '@/lib/skills/core-pack'

export interface KSASkillItem {
  id: string
  nameAr: string
  descriptionAr: string
  category:
    | 'حوكمة'
    | 'مالية'
    | 'أنظمة وشؤون قانونية'
    | 'موارد بشرية'
    | 'تشغيل'
    | 'معرفة'
    | 'مكتب'
  author: string
  skillMarkdownContent: string
  iconName: string
  packId?: string
  /** Shipped under skills/ and injected without marketplace install. */
  autoActive?: boolean
  sourceNoteAr?: string
}

function skillMd(opts: {
  id: string
  name: string
  description: string
  body: string
  scope?: 'shared' | 'personal'
  author?: string
}): string {
  return `---
name: ${opts.id}
description: "${opts.description}"
scope: ${opts.scope || 'shared'}
id: ${opts.id}
author: "${opts.author || 'Arabic Buzz / KSA Pack'}"
---

# ${opts.name}

${opts.body}
`
}

/** Catalog is client-safe — SKILL.md on disk is loaded server-side by the skills API. */
function shippedOrInline(_skillId: string, fallback: string): string {
  return fallback
}

export const KSA_SKILL_CATALOG: KSASkillItem[] = [
  {
    id: 'email_inbox_triage',
    nameAr: 'فرز البريد',
    descriptionAr:
      'تصنيف البريد ومسودات الرد دون إرسال تلقائي — مفعّلة تلقائياً.',
    category: 'تشغيل',
    author: 'Arabic Buzz (GitHub: inbox-triage patterns)',
    iconName: 'mail',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من alirezarezvani/claude-skills و gws-gmail-triage',
    skillMarkdownContent: shippedOrInline(
      'email_inbox_triage',
      skillMd({
        id: 'email_inbox_triage',
        name: 'فرز البريد',
        description: 'فرز بريد الجمعية مع مسودات فقط',
        body: 'صنّف البريد وأعد مسودات — لا ترسل دون موافقة.',
      })
    ),
  },
  {
    id: 'calendar_booking_assistant',
    nameAr: 'مساعد الحجوزات والمواعيد',
    descriptionAr: 'اقتراح أوقات، صياغة دعوات، ومتابعة حجوزات التقويم.',
    category: 'تشغيل',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'calendar',
    packId: 'core-auto',
    autoActive: true,
    skillMarkdownContent: shippedOrInline(
      'calendar_booking_assistant',
      skillMd({
        id: 'calendar_booking_assistant',
        name: 'مساعد الحجوزات والمواعيد',
        description: 'ترتيب المواعيد ودعوات التقويم بالعربية الفصحى',
        body: `عند طلب حجز أو تنسيق موعد:
1. اسأل عن المدة والضيوف والمنطقة الزمنية (الرياض افتراضياً).
2. اقترح فترات واضحة بصيغة يوم/ساعة.
3. استخدم أدوات التقويم عند توفرها، وإلا صِغ نص الدعوة للمستخدم ليرسله.
4. لا تؤكد حجزاً نهائياً دون موافقة صريحة.`,
      })
    ),
  },
  {
    id: 'meeting_minutes_summary',
    nameAr: 'ملخص الاجتماعات',
    descriptionAr: 'تحويل ملاحظات الاجتماع إلى قرارات ومهام وملخص تنفيذي.',
    category: 'تشغيل',
    author: 'Arabic Buzz (GitHub: meeting-notes)',
    iconName: 'file-text',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من claude-office-skills/meeting-notes',
    skillMarkdownContent: shippedOrInline(
      'meeting_minutes_summary',
      skillMd({
        id: 'meeting_minutes_summary',
        name: 'ملخص الاجتماعات',
        description: 'تلخيص الاجتماعات إلى قرارات ومهام',
        body: `أخرج دائماً أربعة أقسام:
- الملخص التنفيذي (3–5 أسطر)
- القرارات
- المهام (المسؤول · الموعد إن وُجد)
- البنود المفتوحة
استخدم العربية الفصحى المهنية ولا تخترع حضوراً أو قرارات غير مذكورة.`,
      })
    ),
  },
  {
    id: 'arabic_office_writer',
    nameAr: 'كاتب المكتب العربي',
    descriptionAr: 'خطابات ومحاضر وعروض ونصوص واجهة بالفصحى وRTL سليم.',
    category: 'مكتب',
    author: 'Arabic Buzz (GitHub: ux-writing-arabic)',
    iconName: 'pen',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من itady74/ux-writing-arabic ومبادئ arabic-presentations',
    skillMarkdownContent: shippedOrInline(
      'arabic_office_writer',
      skillMd({
        id: 'arabic_office_writer',
        name: 'كاتب المكتب العربي',
        description: 'صياغة مستندات مكتبية عربية',
        body: 'اكتب بالعربية الفصحى المهنية مع RTL منطقي دون عكس الحروف.',
      })
    ),
  },
  {
    id: 'research_with_sources',
    nameAr: 'بحث مع مصادر',
    descriptionAr: 'بحث مؤسسي مع استشهاد — دون اختلاق حقائق.',
    category: 'معرفة',
    author: 'Arabic Buzz (GitHub: mattpocock/research)',
    iconName: 'search',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من mattpocock/skills research',
    skillMarkdownContent: shippedOrInline(
      'research_with_sources',
      skillMd({
        id: 'research_with_sources',
        name: 'بحث مع مصادر',
        description: 'بحث مع استشهاد بالمصادر',
        body: 'ابحث في المعرفة أولاً واستشهد بـ [مصدر N] ولا تختلق.',
      })
    ),
  },
  {
    id: 'telegram_ops_notifier',
    nameAr: 'تنبيهات تيليجرام',
    descriptionAr: 'ملخصات وتنبيهات للقناة المرتبطة — تشغيل لا بناء بوت.',
    category: 'تشغيل',
    author: 'Arabic Buzz',
    iconName: 'send',
    packId: 'core-auto',
    autoActive: true,
    skillMarkdownContent: shippedOrInline(
      'telegram_ops_notifier',
      skillMd({
        id: 'telegram_ops_notifier',
        name: 'تنبيهات تيليجرام',
        description: 'تشغيل تنبيهات تيليجرام للغرفة',
        body: 'صِغ تنبيهاً مختصراً واستخدم قناة الغرفة عند الربط.',
      })
    ),
  },
  {
    id: 'daily_ops_checklist',
    nameAr: 'المهام اليومية للتشغيل',
    descriptionAr: 'قائمة صباحية للمراجعة والتنبيهات ومتابعة الغرفة.',
    category: 'تشغيل',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'list-checks',
    packId: 'core-auto',
    autoActive: true,
    skillMarkdownContent: shippedOrInline(
      'daily_ops_checklist',
      skillMd({
        id: 'daily_ops_checklist',
        name: 'المهام اليومية للتشغيل',
        description: 'قائمة تشغيل يومية للغرفة والموافقات والتنبيهات',
        body: `عند طلب «مهام اليوم» أو ملخص صباحي أنشئ قائمة مختصرة:
1. موافقات معلّقة
2. رسائل/تنبيهات تحتاج رداً
3. مواعيد اليوم
4. مهام مفتوحة من ذاكرة الغرفة
رتّب حسب الأولوية واقترح جملة أمر واحدة لكل بند.`,
      })
    ),
  },
  {
    id: 'knowledge_doc_reviewer',
    nameAr: 'مراجعة مستند من المعرفة',
    descriptionAr: 'بحث في عقل الشركة ومراجعة المستند مع ذكر المصادر.',
    category: 'معرفة',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'book-open',
    packId: 'core-auto',
    autoActive: true,
    skillMarkdownContent: shippedOrInline(
      'knowledge_doc_reviewer',
      skillMd({
        id: 'knowledge_doc_reviewer',
        name: 'مراجعة مستند من المعرفة',
        description: 'مراجعة مستند/سؤال عبر قاعدة المعرفة مع الاستشهاد بالمصادر',
        body: `استخدم أداة البحث في المعرفة أولاً.
- أجب فقط بما تدعمه المقتطفات.
- اذكر المصادر في نهاية الرد.
- إن نقصت الأدلة قل ذلك صراحة واطلب رفع الملف أو توضيح الاستعلام.`,
      })
    ),
  },
  {
    id: 'arabic_report_generator',
    nameAr: 'مولّد التقارير العربية',
    descriptionAr: 'تقارير إدارية وفنية بالفصحى وفق أسلوب الجمعيات.',
    category: 'مكتب',
    author: 'Arabic Buzz',
    iconName: 'file-bar-chart',
    packId: 'core-auto',
    autoActive: true,
    skillMarkdownContent: shippedOrInline(
      'arabic_report_generator',
      skillMd({
        id: 'arabic_report_generator',
        name: 'مولّد التقارير العربية',
        description: 'إنشاء تقارير إدارية وفنية باللغة العربية الفصحى',
        body: 'أنشئ تقارير رسمية بالعربية الفصحى مع عناوين وملخص تنفيذي وتوصيات.',
      })
    ),
  },
  {
    id: 'document_ocr_workflow',
    nameAr: 'سير عمل OCR للمستندات',
    descriptionAr:
      'استخراج نص عربي من صور وPDF ممسوح وحفظه في الغرفة — مفعّلة تلقائياً.',
    category: 'معرفة',
    author: 'Arabic Buzz (GitHub: pdf-ocr patterns)',
    iconName: 'scan',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من yejinlei/pdf-ocr-skill وأنماط claude-office-skills',
    skillMarkdownContent: shippedOrInline(
      'document_ocr_workflow',
      skillMd({
        id: 'document_ocr_workflow',
        name: 'سير عمل OCR للمستندات',
        description: 'استخراج نص عربي من صور وPDF ممسوح',
        body: 'استخدم arabic_ocr / read_document ثم احفظ النص — لا تختلق سطوراً.',
      })
    ),
  },
  {
    id: 'excel_ops_reporting',
    nameAr: 'تقارير Excel التشغيلية',
    descriptionAr: 'قراءة وتحليل وتعديل جداول Excel للتقارير — مفعّلة تلقائياً.',
    category: 'مكتب',
    author: 'Arabic Buzz (GitHub: xlsx skill patterns)',
    iconName: 'table',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من anthropics/skills xlsx و document-xlsx',
    skillMarkdownContent: shippedOrInline(
      'excel_ops_reporting',
      skillMd({
        id: 'excel_ops_reporting',
        name: 'تقارير Excel التشغيلية',
        description: 'قراءة وتعديل Excel للتقارير التشغيلية',
        body: 'اقرأ بـ read_excel وعدّل بـ edit_excel دون اختلاق أرقام.',
      })
    ),
  },
  {
    id: 'pdf_form_assistant',
    nameAr: 'مساعد نماذج PDF',
    descriptionAr: 'سرد حقول النماذج وتعبئتها بعد موافقة — مفعّلة تلقائياً.',
    category: 'مكتب',
    author: 'Arabic Buzz (GitHub: pdf-form-filler patterns)',
    iconName: 'file-input',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من claude-office-skills pdf-form-filler',
    skillMarkdownContent: shippedOrInline(
      'pdf_form_assistant',
      skillMd({
        id: 'pdf_form_assistant',
        name: 'مساعد نماذج PDF',
        description: 'تعبئة نماذج PDF بعد مراجعة القيم',
        body: 'اسرد الحقول بـ pdf_list_fields ثم املأ بـ pdf_fill_form بعد موافقة.',
      })
    ),
  },
  {
    id: 'board_decision_pack',
    nameAr: 'حزمة قرار مجلس الإدارة',
    descriptionAr:
      'ورقة قرار: خيارات وتوصية ومسودة قرار ومهام متابعة — مفعّلة تلقائياً.',
    category: 'حوكمة',
    author: 'Arabic Buzz (GitHub: wade-skills / decision-board)',
    iconName: 'gavel',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من zapier/wade-skills و decision-board',
    skillMarkdownContent: shippedOrInline(
      'board_decision_pack',
      skillMd({
        id: 'board_decision_pack',
        name: 'حزمة قرار مجلس الإدارة',
        description: 'تحضير حزمة قرار قابلة للتصويت',
        body: 'أخرج خلفية وخيارات وتوصية ومسودة قرار دون اختلاق وقائع.',
      })
    ),
  },
  {
    id: 'volunteer_coordinator',
    nameAr: 'منسّق المتطوعين',
    descriptionAr: 'نوبات وتذكيرات وقوائم حضور للمتطوعين — مفعّلة تلقائياً.',
    category: 'تشغيل',
    author: 'Arabic Buzz (GitHub: volunteer-coordinator patterns)',
    iconName: 'users',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من travisjneuman volunteer-coordinator مع أدوات الغرفة',
    skillMarkdownContent: shippedOrInline(
      'volunteer_coordinator',
      skillMd({
        id: 'volunteer_coordinator',
        name: 'منسّق المتطوعين',
        description: 'تنسيق نوبات المتطوعين والتذكيرات',
        body: 'ابنِ جدول نوبات وسجّل مهاماً وصِغ تذكيراً دون كشف بيانات خاصة.',
      })
    ),
  },
  {
    id: 'arabic_formal_letter',
    nameAr: 'الخطابات الرسمية العربية',
    descriptionAr: 'قوالب خطابات وتعاميم ومخاطبات رسمية بالفصحى — مفعّلة تلقائياً.',
    category: 'مكتب',
    author: 'Arabic Buzz (GitHub: ux-writing-arabic formal)',
    iconName: 'mail',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من أنماط الكتابة العربية الرسمية للجمعيات',
    skillMarkdownContent: shippedOrInline(
      'arabic_formal_letter',
      skillMd({
        id: 'arabic_formal_letter',
        name: 'الخطابات الرسمية العربية',
        description: 'صياغة خطابات رسمية وتعاميم',
        body: 'اتبع بنية الترويسة والموضوع والمتن والتوقيع — دون اختلاق أرقام صادر.',
      })
    ),
  },
  {
    id: 'followup_crm_lite',
    nameAr: 'متابعة علاقات (CRM خفيف)',
    descriptionAr: 'وعود ومتابعات ومسودات من البريد والاجتماعات — مفعّلة تلقائياً.',
    category: 'تشغيل',
    author: 'Arabic Buzz (GitHub: zapier meeting-follow-up-pipeline)',
    iconName: 'user-check',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من zapier/wade-skills meeting-follow-up-pipeline',
    skillMarkdownContent: shippedOrInline(
      'followup_crm_lite',
      skillMd({
        id: 'followup_crm_lite',
        name: 'متابعة علاقات (CRM خفيف)',
        description: 'إغلاق حلقة الوعود والمتابعات',
        body: 'استخرج الوعود وصِغ مسودات متابعة واقترح مهاماً — دون إرسال تلقائي.',
      })
    ),
  },
  {
    id: 'agenda_builder',
    nameAr: 'بنّاء الأجندة',
    descriptionAr:
      'أجندة اجتماع مرتّبة من التقويم والبريد والمهام — مفعّلة تلقائياً.',
    category: 'تشغيل',
    author: 'Arabic Buzz (GitHub: zapier exec-weekly-agenda-generator)',
    iconName: 'list-ordered',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من zapier/wade-skills exec-weekly-agenda-generator',
    skillMarkdownContent: shippedOrInline(
      'agenda_builder',
      skillMd({
        id: 'agenda_builder',
        name: 'بنّاء الأجندة',
        description: 'بناء أجندة اجتماع مرتّبة بالأولوية',
        body: 'امسح التقويم والمهام والبريد وأخرج بنوداً قابلة للنقاش والقرار.',
      })
    ),
  },
  {
    id: 'ksa_compliance_deadlines',
    nameAr: 'مواعيد الامتثال (السعودية)',
    descriptionAr:
      'ترخيص وعمومية وتقرير سنوي على تقويم الغرفة — مفعّلة تلقائياً.',
    category: 'حوكمة',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'calendar-clock',
    packId: 'core-auto',
    autoActive: true,
    skillMarkdownContent: shippedOrInline(
      'ksa_compliance_deadlines',
      skillMd({
        id: 'ksa_compliance_deadlines',
        name: 'مواعيد الامتثال (السعودية)',
        description: 'متابعة المواعيد النظامية للجمعيات',
        body: 'اعرض ولوّن المواعيد النظامية على تقويم الغرفة دون اختلاق تواريخ قانونية.',
      })
    ),
  },
  {
    id: 'drive_file_organizer',
    nameAr: 'منظّم ملفات Drive',
    descriptionAr:
      'اقتراح أسماء وهيكل مجلدات لملفات الغرفة وعقل الشركة — مفعّلة تلقائياً.',
    category: 'معرفة',
    author: 'Arabic Buzz (GitHub: gws organize-drive + file-naming)',
    iconName: 'folder-tree',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr:
      'مقتبس من googleworkspace/cli recipe-organize-drive-folder و file-naming',
    skillMarkdownContent: shippedOrInline(
      'drive_file_organizer',
      skillMd({
        id: 'drive_file_organizer',
        name: 'منظّم ملفات Drive',
        description: 'إعادة تسمية وتنظيم ملفات الغرفة وDrive',
        body: 'اقترح جدول أسماء موحّدة ونفّذ بعد موافقة — لا تحذف دون طلب صريح.',
      })
    ),
  },
  {
    id: 'word_docx_assistant',
    nameAr: 'مساعد Word',
    descriptionAr: 'إنشاء وتحرير مستندات Word مع استبدال موضعي — مفعّلة تلقائياً.',
    category: 'مكتب',
    author: 'Arabic Buzz (GitHub: anthropics/skills docx)',
    iconName: 'file-text',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من anthropics/skills docx',
    skillMarkdownContent: shippedOrInline(
      'word_docx_assistant',
      skillMd({
        id: 'word_docx_assistant',
        name: 'مساعد Word',
        description: 'تحرير مستندات Word',
        body: 'اقرأ ثم عدّل بـ edit_document (replacements) وأعد الملف.',
      })
    ),
  },
  {
    id: 'email_to_task',
    nameAr: 'من البريد إلى مهمة',
    descriptionAr: 'تحويل بريد قابل للتنفيذ إلى مهام غرفة بعد موافقة — مفعّلة تلقائياً.',
    category: 'تشغيل',
    author: 'Arabic Buzz (GitHub: gws-workflow-email-to-task)',
    iconName: 'list-todo',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من googleworkspace/cli gws-workflow-email-to-task',
    skillMarkdownContent: shippedOrInline(
      'email_to_task',
      skillMd({
        id: 'email_to_task',
        name: 'من البريد إلى مهمة',
        description: 'تحويل البريد إلى مهام غرفة',
        body: 'استخرج المهام من البريد وأنشئها بـ room_tasks_create بعد موافقة.',
      })
    ),
  },
  {
    id: 'email_attachment_filing',
    nameAr: 'أرشفة مرفقات البريد',
    descriptionAr: 'حفظ مرفقات البريد للغرفة أو Drive بأسماء موحّدة — مفعّلة تلقائياً.',
    category: 'معرفة',
    author: 'Arabic Buzz (GitHub: recipe-save-email-attachments)',
    iconName: 'paperclip',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من googleworkspace recipe-save-email-attachments',
    skillMarkdownContent: shippedOrInline(
      'email_attachment_filing',
      skillMd({
        id: 'email_attachment_filing',
        name: 'أرشفة مرفقات البريد',
        description: 'حفظ مرفقات البريد',
        body: 'اعرض المرفقات واحفظها بعد موافقة مع تسمية عربية موحّدة.',
      })
    ),
  },
  {
    id: 'hitl_approvals_queue',
    nameAr: 'طابور الموافقات البشرية',
    descriptionAr: 'تلخيص الموافقات المعلّقة وصياغة قرار HITL — مفعّلة تلقائياً.',
    category: 'حوكمة',
    author: 'Arabic Buzz',
    iconName: 'shield-check',
    packId: 'core-auto',
    autoActive: true,
    skillMarkdownContent: shippedOrInline(
      'hitl_approvals_queue',
      skillMd({
        id: 'hitl_approvals_queue',
        name: 'طابور الموافقات البشرية',
        description: 'تشغيل طابور HITL',
        body: 'لخّص المعلّق ولا توافق نيابة عن المستخدم.',
      })
    ),
  },
  {
    id: 'arabic_presentation_builder',
    nameAr: 'بنّاء العروض العربية',
    descriptionAr: 'شرائح عربية RTL بعناوين ونقاط واضحة — مفعّلة تلقائياً.',
    category: 'مكتب',
    author: 'Arabic Buzz (GitHub: arabic-presentations)',
    iconName: 'presentation',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من sultanalsafran/agent-skills arabic-presentations',
    skillMarkdownContent: shippedOrInline(
      'arabic_presentation_builder',
      skillMd({
        id: 'arabic_presentation_builder',
        name: 'بنّاء العروض العربية',
        description: 'بناء عروض تقديمية عربية',
        body: 'أخرج شرائح RTL: عنوان، أجندة، محتوى، قرارات، خاتمة.',
      })
    ),
  },
  {
    id: 'gov_web_research',
    nameAr: 'بحث مصادر رسمية',
    descriptionAr: 'بحث عبر المعرفة ثم web_search/gov.sa مع استشهاد — مفعّلة تلقائياً.',
    category: 'معرفة',
    author: 'Arabic Buzz (GitHub: mattpocock research)',
    iconName: 'landmark',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من mattpocock/skills research + مسار البحث المجاني',
    skillMarkdownContent: shippedOrInline(
      'gov_web_research',
      skillMd({
        id: 'gov_web_research',
        name: 'بحث مصادر رسمية',
        description: 'بحث من مصادر رسمية مع استشهاد',
        body: 'ابحث في المعرفة ثم الويب الرسمي واستشهد — لا تختلق.',
      })
    ),
  },
  {
    id: 'pdf_document_ops',
    nameAr: 'عمليات PDF',
    descriptionAr: 'إنشاء ودمج وختم واستبدال نص في PDF — مفعّلة تلقائياً.',
    category: 'مكتب',
    author: 'Arabic Buzz (GitHub: anthropics/skills pdf)',
    iconName: 'file',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من anthropics/skills pdf',
    skillMarkdownContent: shippedOrInline(
      'pdf_document_ops',
      skillMd({
        id: 'pdf_document_ops',
        name: 'عمليات PDF',
        description: 'إنشاء ودمج وختم PDF',
        body: 'استخدم pdf_create / pdf_merge / pdf_stamp / pdf_replace_text حسب الحاجة.',
      })
    ),
  },
  {
    id: 'calendar_email_ingest',
    nameAr: 'مواعيد من البريد',
    descriptionAr: 'استخراج مواعيد البريد وإضافتها للتقويم بعد مراجعة — مفعّلة تلقائياً.',
    category: 'تشغيل',
    author: 'Arabic Buzz (GitHub: gws-calendar patterns)',
    iconName: 'calendar-plus',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من أنماط gws-calendar و calendar_scan_email',
    skillMarkdownContent: shippedOrInline(
      'calendar_email_ingest',
      skillMd({
        id: 'calendar_email_ingest',
        name: 'مواعيد من البريد',
        description: 'استيعاب مواعيد من البريد',
        body: 'استخرج المواعيد واعرضها ثم أنشئها بعد موافقة دون تكرار.',
      })
    ),
  },
  {
    id: 'arabic_contract_review',
    nameAr: 'مراجعة العقود',
    descriptionAr:
      'قائمة تحقق لمخاطر ونواقص عقود الجمعية بالفصحى — مفعّلة تلقائياً (ليست استشارة قانونية).',
    category: 'أنظمة وشؤون قانونية',
    author: 'Arabic Buzz (GitHub: claude-office-skills contract-review)',
    iconName: 'scale',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'مقتبس من claude-office-skills/skills contract-review لسياق الجمعيات',
    skillMarkdownContent: shippedOrInline(
      'arabic_contract_review',
      skillMd({
        id: 'arabic_contract_review',
        name: 'مراجعة العقود',
        description: 'مراجعة عقود الجمعية بالفصحى',
        body: 'لخّص العقد، أبرز النواقص والمخاطر، واطرح أسئلة قبل التوقيع — دون استشارة قانونية ملزِمة.',
      })
    ),
  },
  {
    id: 'association_bookkeeping_lite',
    nameAr: 'محاسبة مبسطة للجمعيات',
    descriptionAr:
      'إيرادات/مصروفات وتبرعات ومطابقة من الجداول — مفعّلة تلقائياً (ليست استشارة محاسبية).',
    category: 'مالية',
    author: 'Arabic Buzz',
    iconName: 'receipt',
    packId: 'core-auto',
    autoActive: true,
    sourceNoteAr: 'أنماط محاسبة مبسطة مجانية مكيَّفة للجمعيات',
    skillMarkdownContent: shippedOrInline(
      'association_bookkeeping_lite',
      skillMd({
        id: 'association_bookkeeping_lite',
        name: 'محاسبة مبسطة للجمعيات',
        description: 'محاسبة تشغيلية مبسطة من الجداول',
        body: 'لخّص الحركات من Excel دون اختلاق أرصدة؛ اقترح مطابقة ونواقص مستندية.',
      })
    ),
  },
  {
    id: 'whatsapp_ops_drafter',
    nameAr: 'صياغة تشغيل واتساب',
    descriptionAr:
      'رسائل واتساب تشغيلية مختصرة بالفصحى — مفعّلة تلقائياً (بدون Cloud API).',
    category: 'تشغيل',
    author: 'Arabic Buzz',
    iconName: 'message-circle',
    packId: 'core-auto',
    autoActive: true,
    skillMarkdownContent: shippedOrInline(
      'whatsapp_ops_drafter',
      skillMd({
        id: 'whatsapp_ops_drafter',
        name: 'صياغة تشغيل واتساب',
        description: 'صياغة رسائل واتساب تشغيلية',
        body: 'صِغ رسالة قصيرة للمجموعة؛ أرسل عبر القناة المربوطة فقط بعد موافقة أو اعرض للنسخ.',
      })
    ),
  },
  {
    id: 'zatca_e_invoicing_checker',
    nameAr: 'مدقق الفوترة الإلكترونية (ZATCA)',
    descriptionAr: 'التحقق من هياكل XML/QR للفوترة الإلكترونية - المرحلة الثانية.',
    category: 'مالية',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'receipt',
    packId: 'ksa-core',
    skillMarkdownContent: skillMd({
      id: 'zatca_e_invoicing_checker',
      name: 'مدقق الفوترة الإلكترونية (ZATCA Phase 2)',
      description: 'التحقق من هياكل XML/QR للفوترة الإلكترونية هيئة الزكاة (المرحلة الثانية)',
      body: 'تحقق من اكتمال حقول XML وسلامة رمز QR ومتطلبات المرحلة الثانية قبل الاعتماد. لا تخترع أرقاماً ضريبية — اطلب المصدر.',
    }),
  },
  {
    id: 'ncnp_governance_auditor',
    nameAr: 'مدقق حوكمة الجمعيات (NCNP)',
    descriptionAr:
      'تدقيق محاضر المجالس وفق قائمة تحقق تشغيلية للمركز الوطني — مفعّلة تلقائياً.',
    category: 'حوكمة',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'shield',
    packId: 'core-auto',
    autoActive: true,
    skillMarkdownContent: shippedOrInline(
      'ncnp_governance_auditor',
      skillMd({
        id: 'ncnp_governance_auditor',
        name: 'مدقق حوكمة NCNP',
        description: 'تدقيق محاضر مجالس الجمعيات',
        body: 'راجع المحاضر مقابل النصاب والقرارات والتكليفات دون اختراع وقائع.',
      })
    ),
  },
  {
    id: 'qiwa_saudization_calc',
    nameAr: 'حاسبة التوطين ونطاقات',
    descriptionAr: 'حساب نسب التوطين ومستويات نطاقات للمنشآت.',
    category: 'موارد بشرية',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'users',
    packId: 'ksa-core',
    skillMarkdownContent: skillMd({
      id: 'qiwa_saudization_calc',
      name: 'حاسبة التوطين (قوى / نطاقات)',
      description: 'حساب نطاقات التوطين ومستويات نطاقات',
      body: 'احسب نسب التوطين وحدد مستوى النطاق بناءً على حجم المنشأة والقطاع عند توفر الأرقام من المستخدم أو المستندات.',
    }),
  },
  {
    id: 'commercial_court_brief',
    nameAr: 'ملخص المحكمة التجارية',
    descriptionAr: 'تلخيص الأحكام القضائية السعودية في ملخص تنفيذي بالفصحى.',
    category: 'أنظمة وشؤون قانونية',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'scale',
    packId: 'ksa-core',
    skillMarkdownContent: skillMd({
      id: 'commercial_court_brief',
      name: 'ملخص المحكمة التجارية',
      description: 'تلخيص الأحكام القضائية السعودية في ملخص تنفيذي بالفصحى',
      body: 'لخّص الحكم في نقاط تنفيذية بالعربية الفصحى مع ذكر منطوق الحكم وأسبابه الجوهرية. هذا ليس استشارة قانونية.',
    }),
  },
]

export function getMarketplaceSkill(skillId: string) {
  return KSA_SKILL_CATALOG.find((s) => s.id === skillId)
}

export function searchMarketplaceSkills(
  query: string,
  category?: KSASkillItem['category']
) {
  const q = query.trim()
  return KSA_SKILL_CATALOG.filter((s) => {
    if (category && s.category !== category) return false
    if (!q) return true
    return (
      s.nameAr.includes(q) ||
      s.descriptionAr.includes(q) ||
      s.id.includes(q)
    )
  })
}

export function isCatalogSkillAutoActive(skill: KSASkillItem): boolean {
  return Boolean(skill.autoActive) || isCoreAutoSkill(skill.id)
}
