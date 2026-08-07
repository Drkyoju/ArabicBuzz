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
    descriptionAr: 'تدقيق محاضر مجالس الإدارة وفق معايير المركز الوطني.',
    category: 'حوكمة',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'shield',
    packId: 'ksa-core',
    skillMarkdownContent: skillMd({
      id: 'ncnp_governance_auditor',
      name: 'مدقق حوكمة NCNP',
      description: 'تدقيق محاضر مجالس الجمعيات وفق معايير المركز الوطني لتنمية القطاع غير الربحي',
      body: 'راجع محاضر الاجتماعات مقابل متطلبات الإفصاح والنصاب والتصويت. أشر إلى البنود الناقصة دون اختراع وقائع.',
    }),
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
