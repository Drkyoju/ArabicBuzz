/**
 * Ready reply templates for بريد الجمعية (MSA).
 * Inserted into the reply composer — user edits before SMTP send.
 * Voice shared with mail-intel via association-tone.
 */

import { ASSOCIATION_NAME_AR } from '@/lib/email/association-tone'

export type OrgReplyTemplate = {
  id: string
  labelAr: string
  subjectHintAr?: string
  bodyAr: string
}

export const ORG_REPLY_TEMPLATES: OrgReplyTemplate[] = [
  {
    id: 'ack-receipt',
    labelAr: 'استلام الطلب',
    subjectHintAr: 'استلام رسالتكم',
    bodyAr: `السلام عليكم ورحمة الله وبركاته،

نشكر تواصلكم مع ${ASSOCIATION_NAME_AR}. نؤكّد استلام رسالتكم، وسنعاودكم بعد المراجعة خلال أقرب وقت ممكن.

مع خالص التحية،
إدارة الجمعية`,
  },
  {
    id: 'need-docs',
    labelAr: 'طلب مستندات',
    subjectHintAr: 'استكمال المستندات',
    bodyAr: `السلام عليكم ورحمة الله وبركاته،

للإفادة، نرجو تزويدنا بالمستندات التالية لاستكمال الطلب لدى ${ASSOCIATION_NAME_AR}:
١) …
٢) …
٣) …

يمكن إرفاقها رداً على هذه الرسالة أو رفعها عبر القناة المعتمدة.

مع خالص التحية،
إدارة الجمعية`,
  },
  {
    id: 'meeting-confirm',
    labelAr: 'تأكيد موعد',
    subjectHintAr: 'تأكيد الموعد',
    bodyAr: `السلام عليكم ورحمة الله وبركاته،

نؤكّد موعد اللقاء/الاجتماع على النحو التالي:
• التاريخ: …
• الوقت: … (توقيت السعودية)
• المكان / الرابط: …

إن تعذّر الحضور، نرجو إشعارنا قبل الموعد بوقت كافٍ.

مع خالص التحية،
إدارة الجمعية`,
  },
  {
    id: 'thanks-close',
    labelAr: 'شكر وإغلاق',
    subjectHintAr: 'شكراً لتواصلكم',
    bodyAr: `السلام عليكم ورحمة الله وبركاته،

نشكركم على تعاونكم مع ${ASSOCIATION_NAME_AR}. بهذا نعتبر الموضوع مكتملاً من طرفنا، ونبقى في الخدمة لأي استفسار لاحق.

مع خالص التحية،
إدارة الجمعية`,
  },
  {
    id: 'forward-internal',
    labelAr: 'إحالة داخلية',
    subjectHintAr: 'إحالة لمتابعة داخلية',
    bodyAr: `السلام عليكم ورحمة الله وبركاته،

أُحيل موضوعكم للجهة المختصة داخل ${ASSOCIATION_NAME_AR} للمتابعة. سنوافيكم بالنتيجة أو بطلب توضيح إضافي إن لزم.

مع خالص التحية،
إدارة الجمعية`,
  },
  {
    id: 'decline-polite',
    labelAr: 'اعتذار مهذب',
    subjectHintAr: 'بخصوص طلبكم',
    bodyAr: `السلام عليكم ورحمة الله وبركاته،

نشكر تواصلكم مع ${ASSOCIATION_NAME_AR}. بعد المراجعة، يتعذّر علينا حالياً تلبية الطلب كما ورد، للأسباب التالية:
• …

إن رغبتم بصيغة بديلة أو استكمال لاحق، نرحّب بتوضيح إضافي.

مع خالص التحية،
إدارة الجمعية`,
  },
]

export function orgReplyTemplateById(id: string): OrgReplyTemplate | undefined {
  return ORG_REPLY_TEMPLATES.find((t) => t.id === id)
}
