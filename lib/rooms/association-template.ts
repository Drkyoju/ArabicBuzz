/**
 * Association room template — server helpers + re-exports.
 */

import type { SharedScope } from '@/lib/scopes/types'
import {
  ASSOCIATION_ROLE_SLOTS,
  type AssociationRoleSlot,
} from '@/lib/rooms/association-template-data'
import {
  SYSTEM_DEADLINE_KINDS,
  SYSTEM_DEADLINE_LABELS_AR,
  type SystemDeadlineKind,
  upsertSystemDeadline,
} from '@/lib/rooms/system-deadlines'

export type { AssociationRoleSlot }
export { ASSOCIATION_ROLE_SLOTS }

export type AssociationTemplateResult = {
  scope: SharedScope
  welcomeAr: string
  roleLabelsAr: string[]
  deadlineKinds: SystemDeadlineKind[]
}

/** Build a shared association room scope (client or server). */
export function buildAssociationRoomScope(opts?: {
  nameAr?: string
  id?: string
}): AssociationTemplateResult {
  const id = opts?.id || `assoc-${Date.now().toString(36)}`
  const nameAr = opts?.nameAr?.trim() || 'غرفة الجمعية'
  const roleLabelsAr = ASSOCIATION_ROLE_SLOTS.map((r) => r.labelAr)

  const scope: SharedScope = {
    id,
    nameAr,
    descriptionAr:
      'قالب جمعية: مجلس ولجان وموظفون ومتطوعون — تقويم مشترك وموافقات عربية.',
    members: ['user-1'],
    memberLabelsAr: roleLabelsAr,
    agentLabelsAr: ['وكيل التقارير', 'وكيل الامتثال', 'وكيل الجدولة'],
    sharedMemory: [
      'اللغة الرسمية: العربية الفصحى المهنية.',
      'الأدوار: مجلس الإدارة · المدير التنفيذي · أعضاء اللجان · موظفون · متطوعون · مدقق.',
      'المواعيد النظامية (ترخيص / عمومية / تقرير سنوي) تُتابع في تقويم الفريق.',
      'الإجراءات عالية المخاطر تمر عبر موافقة بشرية عند تفعيل HITL.',
      'عند الإجابة من قاعدة المعرفة: اذكر المصادر بصيغة [مصدر N: …].',
    ],
    skills: [
      'arabic_report_generator',
      'zatca_e_invoicing_checker',
      'cron_digest',
      'channel_notify',
    ],
  }

  const welcomeAr = [
    `مرحباً بكم في «${nameAr}».`,
    'هذه غرفة جمعية جاهزة: أدوار المجلس واللجان والموظفين مُعرَّفة في الذاكرة.',
    'الخطوة التالية: ادعُ الأعضاء من لوحة الفريق، واضبط المواعيد النظامية في التقويم، واربط تيليجرام للتنبيهات.',
  ].join('\n')

  return {
    scope,
    welcomeAr,
    roleLabelsAr,
    deadlineKinds: [...SYSTEM_DEADLINE_KINDS],
  }
}

/**
 * Seed placeholder regulatory deadlines ~90/180/270 days out if none exist.
 */
export async function seedAssociationStarterDeadlines(opts: {
  scopeId: string
  createdBy?: string
  createdByAr?: string
}): Promise<{ seeded: number; labelsAr: string[] }> {
  const labelsAr: string[] = []
  let seeded = 0
  const offsetsDays: Record<SystemDeadlineKind, number> = {
    license_expiry: 90,
    general_assembly: 180,
    annual_report: 270,
  }

  for (const kind of SYSTEM_DEADLINE_KINDS) {
    const d = new Date()
    d.setDate(d.getDate() + offsetsDays[kind])
    const ymd = d.toISOString().slice(0, 10)
    try {
      const res = await upsertSystemDeadline({
        scopeId: opts.scopeId,
        kind,
        dateYmd: ymd,
        notesAr: `موعد ابتدائي من قالب الجمعية — عدّل التاريخ من لوحة المواعيد النظامية.`,
        createdBy: opts.createdBy,
        createdByAr: opts.createdByAr || 'قالب الجمعية',
      })
      if (res.created) {
        seeded += 1
        labelsAr.push(SYSTEM_DEADLINE_LABELS_AR[kind])
      }
    } catch {
      /* soft */
    }
  }

  return { seeded, labelsAr }
}
