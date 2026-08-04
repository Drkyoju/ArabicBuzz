/**
 * Seeded «جمعية النور الخيرية» guest demo — fills empty states so first paint
 * proves agents, HITL, and audit instead of a graveyard of empty cards.
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

function arTime(h: number, m = 0) {
  const suffix = h >= 12 ? 'م' : 'ص'
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${pad(m)} ${suffix}`
}

/** Build a fresh demo digest anchored to "today" in the browser. */
export function buildGuestDemoDigest(now = new Date()): DemoDigest {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const dayAfter = new Date(today)
  dayAfter.setDate(today.getDate() + 2)

  const yY = ymd(yesterday)
  const yT = ymd(today)
  const yTom = ymd(tomorrow)
  const yDa = ymd(dayAfter)

  return {
    demo: true,
    associationAr: 'جمعية النور الخيرية (معاينة)',
    days: {
      yesterday: yY,
      today: yT,
      tomorrow: yTom,
      dayAfter: yDa,
    },
    calendar: {
      yesterday: [
        {
          id: 'demo-y1',
          titleAr: 'مراجعة محضر المجلس',
          startsAtAr: `${yY} · ${arTime(16)}`,
          endsAtAr: arTime(17),
          locationAr: 'غرفة العمليات',
        },
      ],
      today: [
        {
          id: 'demo-t1',
          titleAr: 'اجتماع لجنة البرامج',
          startsAtAr: `${yT} · ${arTime(11)}`,
          endsAtAr: arTime(12, 30),
          hasZoom: true,
          locationAr: 'Zoom + غرفة الفريق',
        },
        {
          id: 'demo-t2',
          titleAr: 'موافقة بشرية: مزامنة Drive',
          startsAtAr: `${yT} · ${arTime(14)}`,
          endsAtAr: arTime(14, 15),
        },
      ],
      tomorrow: [
        {
          id: 'demo-tm1',
          titleAr: 'ورشة اعتماد سدايا — تصدير الحزمة',
          startsAtAr: `${yTom} · ${arTime(10)}`,
          endsAtAr: arTime(11),
          hasZoom: true,
        },
      ],
      dayAfter: [
        {
          id: 'demo-da1',
          titleAr: 'متابعة تبرعات الربع',
          startsAtAr: `${yDa} · ${arTime(9, 30)}`,
          endsAtAr: arTime(10, 30),
        },
      ],
      week: [
        {
          id: 'demo-w1',
          titleAr: 'اجتماع لجنة البرامج',
          startsAtAr: `${yT} · ${arTime(11)}`,
          endsAtAr: arTime(12, 30),
          hasZoom: true,
        },
        {
          id: 'demo-w2',
          titleAr: 'ورشة اعتماد سدايا',
          startsAtAr: `${yTom} · ${arTime(10)}`,
          endsAtAr: arTime(11),
          hasZoom: true,
        },
        {
          id: 'demo-w3',
          titleAr: 'مجلس الإدارة الشهري',
          startsAtAr: `${ymd(new Date(today.getTime() + 4 * 86400000))} · ${arTime(18)}`,
          endsAtAr: arTime(20),
        },
      ],
    },
    commitments: {
      count: 4,
      items: [
        {
          id: 'c1',
          kind: 'deadline',
          titleAr: 'تسليم تقرير الامتثال الربعي',
          whenAtAr: yTom,
          detailAr: 'وكيل الامتثال جهّز المسودة',
        },
        {
          id: 'c2',
          kind: 'task',
          titleAr: 'اعتماد مزامنة مجلد Drive',
          whenAtAr: yT,
          detailAr: 'بانتظار موافقة مسؤول',
        },
        {
          id: 'c3',
          kind: 'event',
          titleAr: 'اجتماع لجنة البرامج',
          whenAtAr: `${yT} ${arTime(11)}`,
          detailAr: 'Zoom',
        },
        {
          id: 'c4',
          kind: 'task',
          titleAr: 'تصدير حزمة اعتماد سدايا',
          whenAtAr: yTom,
          detailAr: 'محضر + حضور + ختم',
        },
      ],
    },
    systemDeadlines: [
      {
        id: 'sd1',
        labelAr: 'تجديد ترخيص الجمعية',
        daysLeft: 18,
        startsAtAr: ymd(new Date(today.getTime() + 18 * 86400000)),
      },
      {
        id: 'sd2',
        labelAr: 'إفصاح سدايا السنوي',
        daysLeft: 42,
        startsAtAr: ymd(new Date(today.getTime() + 42 * 86400000)),
      },
    ],
    zoom: {
      liveNow: false,
      liveCount: 0,
      lastLiveAtAr: `${yY} · ${arTime(16, 40)}`,
      messageAr: 'آخر بث: مراجعة محضر المجلس — انتهى بنجاح',
      recentSessions: [
        {
          topic: 'مراجعة محضر المجلس',
          live: false,
          lastSeenAt: yesterday.toISOString(),
          endedAt: yesterday.toISOString(),
        },
      ],
    },
    activity: [
      {
        id: 'a1',
        actorAr: 'وكيل التقارير',
        actionAr: 'أنشأ ملخص قرارات',
        detailAr: '٣ قرارات من اجتماع الأمس',
        atAr: `${arTime(9, 12)}`,
        kind: 'agent',
      },
      {
        id: 'a2',
        actorAr: 'سارة',
        actionAr: 'عدّلت ملف سياسة الموافقات',
        detailAr: 'ملفات الجمعية',
        atAr: `${arTime(8, 55)}`,
        kind: 'edit',
      },
      {
        id: 'a3',
        actorAr: 'وكيل الامتثال',
        actionAr: 'طلب موافقة بشرية',
        detailAr: 'drive_sync_brain',
        atAr: `${arTime(8, 40)}`,
        kind: 'hitl',
      },
      {
        id: 'a4',
        actorAr: 'فهد',
        actionAr: 'فتح غرفة الفريق',
        detailAr: null,
        atAr: `${arTime(8, 5)}`,
        kind: 'presence',
      },
    ],
    people: [
      {
        nameAr: 'سارة',
        email: 'sara@noor.example',
        actions: 6,
        lastAction: 'عدّلت سياسة الموافقات',
        lastAtAr: arTime(8, 55),
      },
      {
        nameAr: 'فهد',
        email: 'fahd@noor.example',
        actions: 3,
        lastAction: 'فتح غرفة الفريق',
        lastAtAr: arTime(8, 5),
      },
      {
        nameAr: 'وكيل التقارير',
        actions: 4,
        lastAction: 'ملخص قرارات',
        lastAtAr: arTime(9, 12),
      },
      {
        nameAr: 'وكيل الامتثال',
        actions: 2,
        lastAction: 'طلب موافقة',
        lastAtAr: arTime(8, 40),
      },
    ],
    tasks: {
      openCount: 3,
      items: [
        { id: 'tk1', titleAr: 'اعتماد مزامنة Drive', status: 'معلّق' },
        { id: 'tk2', titleAr: 'مراجعة مسودة الامتثال', status: 'قيد العمل' },
        { id: 'tk3', titleAr: 'تجهيز حزمة سدايا', status: 'مفتوح' },
      ],
    },
    recentPosts: [
      {
        authorAr: 'وكيل التقارير',
        content:
          'ملخص: اعتمد المجلس ميزانية البرامج، وأُجّل بند الشراكات للأسبوع القادم.',
        atAr: arTime(9, 12),
        kind: 'agent',
      },
      {
        authorAr: 'سارة',
        content: '@compliance راجع سياسة الموافقات قبل مزامنة Drive.',
        atAr: arTime(8, 50),
        kind: 'human',
      },
      {
        authorAr: 'وكيل الامتثال',
        content:
          'طلبت موافقة بشرية على مزامنة المجلد — لا أُنفّذ دون اعتماد مسؤول.',
        atAr: arTime(8, 41),
        kind: 'agent',
      },
    ],
    pendingApprovals: [
      {
        id: 'demo-appr-1',
        actionName: 'drive_sync_brain',
        riskLevel: 'HIGH',
        messageAr: 'مزامنة مجلد «ملفات الجمعية» إلى عقل الشركة',
        agentAr: 'وكيل الامتثال',
      },
      {
        id: 'demo-appr-2',
        actionName: 'telegram_broadcast',
        riskLevel: 'HIGH',
        messageAr: 'إرسال تذكير موعد النظام للجنة عبر تيليجرام',
        agentAr: 'وكيل القنوات',
      },
    ],
    auditEntries: [
      {
        id: 'aud-1',
        atAr: `${yT} ${arTime(9, 12)}`,
        actorAr: 'وكيل التقارير',
        actionAr: 'توليد ملخص قرارات (مسودة)',
        riskTier: 'TIER_1_LOW',
        watermarkHint: 'sdaia·ab·demo·a1f3',
      },
      {
        id: 'aud-2',
        atAr: `${yT} ${arTime(8, 40)}`,
        actorAr: 'وكيل الامتثال',
        actionAr: 'طلب HITL · drive_sync_brain',
        riskTier: 'TIER_3_HIGH',
        watermarkHint: 'sdaia·ab·demo·b92c',
      },
      {
        id: 'aud-3',
        atAr: `${yY} ${arTime(16, 45)}`,
        actorAr: 'سارة',
        actionAr: 'اعتماد تصدير حزمة محضر',
        riskTier: 'TIER_2_MEDIUM',
        watermarkHint: 'sdaia·ab·demo·c4e1',
      },
      {
        id: 'aud-4',
        atAr: `${yY} ${arTime(16, 20)}`,
        actorAr: 'فهد',
        actionAr: 'رفع ملف سياسة الموافقات',
        riskTier: 'TIER_1_LOW',
        watermarkHint: 'sdaia·ab·demo·d7aa',
      },
    ],
    agentActivity: [
      {
        agentAr: 'وكيل التقارير',
        statusAr: 'أنهى للتو',
        detailAr: 'ملخص قرارات اجتماع الأمس',
      },
      {
        agentAr: 'وكيل الامتثال',
        statusAr: 'بانتظار موافقة',
        detailAr: 'مزامنة Drive معلّقة على مسؤول',
      },
    ],
  }
}

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
    ownerBondAr: 'وكيل امتثال · كل طلب موافقة يُسجَّل بختم سدايا',
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
