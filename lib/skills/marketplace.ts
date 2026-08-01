export interface KSASkillItem {
  id: string
  nameAr: string
  descriptionAr: string
  category: 'حوكمة' | 'مالية' | 'أنظمة وشؤون قانونية' | 'موارد بشرية'
  author: string
  skillMarkdownContent: string
  iconName: string
}

export const KSA_SKILL_CATALOG: KSASkillItem[] = [
  {
    id: 'zatca_e_invoicing_checker',
    nameAr: 'مدقق الفوترة الإلكترونية (ZATCA)',
    descriptionAr: 'التحقق من هياكل XML/QR للفوترة الإلكترونية - المرحلة الثانية.',
    category: 'مالية',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'receipt',
    skillMarkdownContent: '---\nname: zatca_e_invoicing_checker\ndescription: "التحقق من هياكل XML/QR للفوترة الإلكترونية هيئة الزكاة (المرحلة الثانية)"\nscope: shared\nid: zatca_e_invoicing_checker\nauthor: "Arabic Buzz / KSA Pack"\n---\n\n# قواعد الفوترة الإلكترونية (ZATCA Phase 2)\nتحقق من اكتمال حقول XML وسلامة رمز QR ومتطلبات المرحلة الثانية قبل الاعتماد.\n',
  },
  {
    id: 'ncnp_governance_auditor',
    nameAr: 'مدقق حوكمة الجمعيات (NCNP)',
    descriptionAr: 'تدقيق محاضر مجالس الإدارة وفق معايير المركز الوطني.',
    category: 'حوكمة',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'shield',
    skillMarkdownContent: '---\nname: ncnp_governance_auditor\ndescription: "تدقيق محاضر مجالس الجمعيات وفق معايير المركز الوطني لتنمية القطاع غير الربحي"\nscope: shared\nid: ncnp_governance_auditor\nauthor: "Arabic Buzz / KSA Pack"\n---\n\n# مدقق حوكمة NCNP\nراجع محاضر الاجتماعات مقابل متطلبات الإفصاح والنصاب والتصويت.\n',
  },
  {
    id: 'qiwa_saudization_calc',
    nameAr: 'حاسبة التوطين ونطاقات',
    descriptionAr: 'حساب نسب التوطين ومستويات نطاقات للمنشآت.',
    category: 'موارد بشرية',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'users',
    skillMarkdownContent: '---\nname: qiwa_saudization_calc\ndescription: "حساب نطاقات التوطين ومستويات نطاقات"\nscope: shared\nid: qiwa_saudization_calc\nauthor: "Arabic Buzz / KSA Pack"\n---\n\n# حاسبة التوطين (قوى / نطاقات)\nاحسب نسب التوطين وحدد مستوى النطاق بناءً على حجم المنشأة والقطاع.\n',
  },
  {
    id: 'commercial_court_brief',
    nameAr: 'ملخص المحكمة التجارية',
    descriptionAr: 'تلخيص الأحكام القضائية السعودية في ملخص تنفيذي بالفصحى.',
    category: 'أنظمة وشؤون قانونية',
    author: 'Arabic Buzz / KSA Pack',
    iconName: 'scale',
    skillMarkdownContent: '---\nname: commercial_court_brief\ndescription: "تلخيص الأحكام القضائية السعودية في ملخص تنفيذي بالفصحى"\nscope: shared\nid: commercial_court_brief\nauthor: "Arabic Buzz / KSA Pack"\n---\n\n# ملخص المحكمة التجارية\nلخّص الحكم في نقاط تنفيذية بالعربية الفصحى مع ذكر منطوق الحكم وأسبابه الجوهرية.\n',
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
