/**
 * MSA association letter templates → filled body for Word/PDF.
 */

export type LetterTemplateId =
  | 'official_letter'
  | 'circular'
  | 'thank_you'
  | 'meeting_invite'
  | 'donation_receipt'

export type LetterField = {
  key: string
  labelAr: string
  placeholderAr?: string
  multiline?: boolean
}

export type LetterTemplate = {
  id: LetterTemplateId
  titleAr: string
  descriptionAr: string
  fields: LetterField[]
  buildBody: (values: Record<string, string>) => { title: string; paragraphs: string[] }
}

function v(values: Record<string, string>, key: string, fallback = '…………') {
  const s = String(values[key] || '').trim()
  return s || fallback
}

export const LETTER_TEMPLATES: LetterTemplate[] = [
  {
    id: 'official_letter',
    titleAr: 'خطاب رسمي',
    descriptionAr: 'مخاطبة جهة خارجية بصيغة جمعية.',
    fields: [
      { key: 'orgName', labelAr: 'اسم الجمعية' },
      { key: 'recipient', labelAr: 'الموجّه إليه' },
      { key: 'subject', labelAr: 'الموضوع' },
      { key: 'body', labelAr: 'نص الخطاب', multiline: true },
      { key: 'signer', labelAr: 'الموقّع / الصفة' },
    ],
    buildBody: (values) => ({
      title: `خطاب رسمي — ${v(values, 'subject', 'بدون موضوع')}`,
      paragraphs: [
        `بسم الله الرحمن الرحيم`,
        `سعادة / ${v(values, 'recipient')}`,
        `السلام عليكم ورحمة الله وبركاته،`,
        `الموضوع: ${v(values, 'subject')}`,
        v(values, 'body', '……'),
        `وتفضلوا بقبول فائق الاحترام والتقدير.`,
        v(values, 'signer', 'إدارة الجمعية'),
        v(values, 'orgName', 'الجمعية'),
      ],
    }),
  },
  {
    id: 'circular',
    titleAr: 'تعميم داخلي',
    descriptionAr: 'تعميم للموظفين / اللجان.',
    fields: [
      { key: 'orgName', labelAr: 'اسم الجمعية' },
      { key: 'audience', labelAr: 'المخاطَبون' },
      { key: 'subject', labelAr: 'عنوان التعميم' },
      { key: 'body', labelAr: 'نص التعميم', multiline: true },
      { key: 'effectiveDate', labelAr: 'تاريخ السريان' },
    ],
    buildBody: (values) => ({
      title: `تعميم — ${v(values, 'subject')}`,
      paragraphs: [
        `${v(values, 'orgName', 'الجمعية')} — تعميم داخلي`,
        `إلى: ${v(values, 'audience', 'جميع العاملين')}`,
        `الموضوع: ${v(values, 'subject')}`,
        v(values, 'body'),
        values.effectiveDate?.trim()
          ? `يسري اعتباراً من: ${values.effectiveDate.trim()}`
          : '',
        `والله الموفق.`,
      ].filter(Boolean),
    }),
  },
  {
    id: 'thank_you',
    titleAr: 'خطاب شكر',
    descriptionAr: 'شكر متبرع أو جهة متعاونة.',
    fields: [
      { key: 'orgName', labelAr: 'اسم الجمعية' },
      { key: 'recipient', labelAr: 'المشكور' },
      { key: 'reason', labelAr: 'سبب الشكر', multiline: true },
      { key: 'signer', labelAr: 'الموقّع' },
    ],
    buildBody: (values) => ({
      title: 'خطاب شكر وتقدير',
      paragraphs: [
        `سعادة / ${v(values, 'recipient')}`,
        `السلام عليكم ورحمة الله وبركاته،`,
        `يتقدم ${v(values, 'orgName', 'مجلس إدارة الجمعية')} بخالص الشكر والتقدير على:`,
        v(values, 'reason'),
        `سائلين الله أن يجعل ذلك في ميزان حسناتكم.`,
        v(values, 'signer', 'رئيس مجلس الإدارة'),
      ],
    }),
  },
  {
    id: 'meeting_invite',
    titleAr: 'دعوة اجتماع',
    descriptionAr: 'دعوة رسمية لحضور اجتماع.',
    fields: [
      { key: 'orgName', labelAr: 'اسم الجمعية' },
      { key: 'recipient', labelAr: 'المدعوّون' },
      { key: 'meetingTitle', labelAr: 'عنوان الاجتماع' },
      { key: 'when', labelAr: 'الزمان' },
      { key: 'where', labelAr: 'المكان / الرابط' },
      { key: 'agenda', labelAr: 'جدول الأعمال', multiline: true },
    ],
    buildBody: (values) => ({
      title: `دعوة — ${v(values, 'meetingTitle')}`,
      paragraphs: [
        `يسر ${v(values, 'orgName', 'الجمعية')} دعوتكم لحضور:`,
        `الاجتماع: ${v(values, 'meetingTitle')}`,
        `إلى: ${v(values, 'recipient')}`,
        `الزمان: ${v(values, 'when')}`,
        `المكان: ${v(values, 'where')}`,
        `جدول الأعمال:`,
        v(values, 'agenda', '—'),
        `نرجو التكرم بالحضور أو الاعتذار مسبقاً.`,
      ],
    }),
  },
  {
    id: 'donation_receipt',
    titleAr: 'إشعار استلام تبرع',
    descriptionAr: 'إشعار مبسّط باستلام تبرع (ليس سنداً مالياً رسمياً).',
    fields: [
      { key: 'orgName', labelAr: 'اسم الجمعية' },
      { key: 'donor', labelAr: 'اسم المتبرع' },
      { key: 'amount', labelAr: 'المبلغ / الوصف' },
      { key: 'date', labelAr: 'تاريخ الاستلام' },
      { key: 'purpose', labelAr: 'الغرض', multiline: true },
    ],
    buildBody: (values) => ({
      title: 'إشعار استلام تبرع',
      paragraphs: [
        `تشهد ${v(values, 'orgName', 'الجمعية')} باستلام تبرع من:`,
        `المتبرع: ${v(values, 'donor')}`,
        `المبلغ/الوصف: ${v(values, 'amount')}`,
        `التاريخ: ${v(values, 'date')}`,
        `الغرض: ${v(values, 'purpose', 'دعم برامج الجمعية')}`,
        `مع خالص الشكر والتقدير.`,
        `ملاحظة: هذا إشعار إداري وليس بديلاً عن السندات المحاسبية الرسمية.`,
      ],
    }),
  },
]

export function getLetterTemplate(id: string): LetterTemplate | undefined {
  return LETTER_TEMPLATES.find((t) => t.id === id)
}
