/**
 * Guest digest shape used when the visitor is not signed in.
 * Intentionally empty — never invent calendar events, Zoom sessions,
 * approvals, people, or system deadlines for first paint.
 */

export type DemoDigest = {
  demo: true
  associationAr: string
  days: { yesterday: string; today: string; tomorrow: string; dayAfter: string }
  calendar: {
    yesterday: Array<{
      id: string
      titleAr: string
      startsAtAr: string
      endsAtAr: string
      hasZoom?: boolean
      locationAr?: string | null
    }>
    today: Array<{
      id: string
      titleAr: string
      startsAtAr: string
      endsAtAr: string
      hasZoom?: boolean
      locationAr?: string | null
    }>
    tomorrow: Array<{
      id: string
      titleAr: string
      startsAtAr: string
      endsAtAr: string
      hasZoom?: boolean
      locationAr?: string | null
    }>
    dayAfter: Array<{
      id: string
      titleAr: string
      startsAtAr: string
      endsAtAr: string
      hasZoom?: boolean
      locationAr?: string | null
    }>
    week: Array<{
      id: string
      titleAr: string
      startsAtAr: string
      endsAtAr: string
      hasZoom?: boolean
      locationAr?: string | null
    }>
  }
  commitments: {
    count: number
    items: Array<{
      id: string
      kind: 'event' | 'task' | 'deadline'
      titleAr: string
      whenAtAr: string
      detailAr?: string | null
    }>
  }
  systemDeadlines: Array<{
    id: string
    labelAr: string
    daysLeft: number
    startsAtAr: string
  }>
  zoom: {
    liveNow: boolean
    liveCount: number
    lastLiveAtAr?: string | null
    messageAr?: string
    recentSessions?: Array<{
      topic?: string | null
      live: boolean
      lastSeenAt: string
      endedAt?: string | null
    }>
  }
  activity: Array<{
    id: string
    actorAr: string
    actionAr: string
    detailAr?: string | null
    atAr: string
    kind: string
  }>
  people: Array<{
    nameAr: string
    email?: string | null
    actions: number
    lastAction: string
    lastAtAr: string
  }>
  tasks: {
    openCount: number
    items: Array<{ id: string; titleAr: string; status: string }>
  }
  recentPosts: Array<{
    authorAr: string
    content: string
    atAr: string
    kind: string
  }>
  pendingApprovals: Array<{
    id: string
    actionName: string
    riskLevel: 'LOW' | 'HIGH'
    messageAr: string
    agentAr: string
  }>
  auditEntries: Array<{
    id: string
    atAr: string
    actorAr: string
    actionAr: string
    riskTier: string
    watermarkHint: string
  }>
  agentActivity: Array<{
    agentAr: string
    statusAr: string
    detailAr: string
  }>
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Empty guest digest — honest empty states, no fabricated cockpit data. */
export function buildGuestDemoDigest(now = new Date()): DemoDigest {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const dayAfter = new Date(today)
  dayAfter.setDate(today.getDate() + 2)

  return {
    demo: true,
    associationAr: '',
    days: {
      yesterday: ymd(yesterday),
      today: ymd(today),
      tomorrow: ymd(tomorrow),
      dayAfter: ymd(dayAfter),
    },
    calendar: {
      yesterday: [],
      today: [],
      tomorrow: [],
      dayAfter: [],
      week: [],
    },
    commitments: { count: 0, items: [] },
    systemDeadlines: [],
    zoom: {
      liveNow: false,
      liveCount: 0,
      lastLiveAtAr: null,
      messageAr: '',
      recentSessions: [],
    },
    activity: [],
    people: [],
    tasks: { openCount: 0, items: [] },
    recentPosts: [],
    pendingApprovals: [],
    auditEntries: [],
    agentActivity: [],
  }
}

/** Static capability copy for built-in agent seats (not fabricated activity). */
export const DEMO_AGENT_PROFILES: Record<
  string,
  {
    permissionsAr: string[]
    capabilitiesAr: string[]
    modelHintAr: string
    ownerBondAr: string
  }
> = {
  'agent-reports': {
    permissionsAr: [
      'قراءة ذاكرة الغرفة المشتركة',
      'البحث في معرفة الجمعية',
      'إنشاء مسودات وتقارير',
      'لا يرسل خارجياً دون موافقة',
    ],
    capabilitiesAr: ['ملخصات تنفيذية', 'محاضر', 'لوحات قرارات'],
    modelHintAr: 'أعلى دقة — سحابي',
    ownerBondAr: 'مربوط بغرفة الفريق · يوقّع كل مخرجاته في سجل التدقيق',
  },
  'agent-compliance': {
    permissionsAr: [
      'اقتراح إجراءات عالية المخاطر',
      'طلب موافقة بشرية (HITL)',
      'قراءة سياسات الامتثال',
      'لا ينفّذ أدوات حساسة دون اعتماد',
    ],
    capabilitiesAr: ['تنبيه مخاطر', 'بوابة موافقات', 'مراجعة سياسات'],
    modelHintAr: 'خصوصية أعلى — مراجعة قبل التنفيذ',
    ownerBondAr: 'وكيل امتثال · كل طلب موافقة يُسجَّل بختم التدقيق',
  },
  'agent-cron': {
    permissionsAr: ['جدولة تذكيرات', 'قراءة المواعيد', 'لا يحذف بيانات'],
    capabilitiesAr: ['Cron', 'تذكيرات تيليجرام'],
    modelHintAr: 'متوازن — تشغيلي',
    ownerBondAr: 'غرفة العمليات',
  },
  'agent-channels': {
    permissionsAr: [
      'اقتراح رسائل قنوات',
      'يتطلب HITL للإرسال الجماعي',
    ],
    capabilitiesAr: ['تيليجرام', 'واتساب'],
    modelHintAr: 'متوازن',
    ownerBondAr: 'غرفة العمليات',
  },
  'agent-desk': {
    permissionsAr: ['ذاكرة المكتب الشخصي فقط', 'ملفات خاصة'],
    capabilitiesAr: ['تنظيم يومي', 'مسودات خاصة'],
    modelHintAr: 'سريع',
    ownerBondAr: 'مساحة شخصية معزولة عن الغرف المشتركة',
  },
  'agent-research': {
    permissionsAr: ['ذاكرة مكتب البحث', 'لا ينشر للفريق تلقائياً'],
    capabilitiesAr: ['مسودات', 'مقارنة خيارات'],
    modelHintAr: 'أعلى دقة',
    ownerBondAr: 'مسودات قبل النقل لغرفة مشتركة',
  },
}
