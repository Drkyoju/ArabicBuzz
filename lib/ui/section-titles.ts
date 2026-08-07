/** Arabic label for each surface — shared by the mobile bar and desktop bar. */
export const SECTION_TITLE_AR: Record<string, string> = {
  home: 'لوحة اليوم',
  assistants: 'مهام التشغيل',
  mail: 'بريد الجمعية',
  calendar: 'تقويم الفريق',
  chats: 'غرفة الفريق',
  files: 'ملفات الفريق',
  approvals: 'صندوق الموافقات',
  audit: 'سجل العمل',
  skills: 'المهارات والمهام',
  'api-keys': 'مفاتيح النماذج',
  ops: 'صحة الأنظمة',
  usage: 'استهلاك الرموز',
  settings: 'الإعدادات',
}

export function sectionTitleAr(section?: string | null): string {
  if (!section) return 'Arabic Buzz'
  return SECTION_TITLE_AR[section] || 'Arabic Buzz'
}
