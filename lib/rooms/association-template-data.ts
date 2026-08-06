/**
 * Client-safe association template constants (no DB / server imports).
 */

export type AssociationRoleSlot = {
  id: string
  labelAr: string
  roomRole: 'owner' | 'editor' | 'member' | 'viewer'
  hintAr: string
}

export const ASSOCIATION_ROLE_SLOTS: AssociationRoleSlot[] = [
  {
    id: 'board',
    labelAr: 'مجلس الإدارة',
    roomRole: 'owner',
    hintAr: 'قرارات واعتمادات عالية المخاطر',
  },
  {
    id: 'exec',
    labelAr: 'المدير التنفيذي',
    roomRole: 'editor',
    hintAr: 'تشغيل يومي وملخص أسبوعي',
  },
  {
    id: 'committee',
    labelAr: 'عضو لجنة',
    roomRole: 'member',
    hintAr: 'لجان البرامج / المالية / العضوية',
  },
  {
    id: 'staff',
    labelAr: 'موظف',
    roomRole: 'member',
    hintAr: 'تنفيذ المهام والتقارير',
  },
  {
    id: 'volunteer',
    labelAr: 'متطوع',
    roomRole: 'viewer',
    hintAr: 'مشاركة محدودة بدون تعديل حساس',
  },
  {
    id: 'auditor',
    labelAr: 'مدقق',
    roomRole: 'viewer',
    hintAr: 'اطّلاع على السجل والتقارير فقط',
  },
]
