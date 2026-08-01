import type {
  ActiveScopeContext,
  PersonalScope,
  Scope,
  SharedScope,
} from './types'

export function isPersonalScope(scope: Scope): scope is PersonalScope {
  return 'userId' in scope && 'privateMemory' in scope
}

export function isSharedScope(scope: Scope): scope is SharedScope {
  return 'members' in scope && 'sharedMemory' in scope
}

export function resolveActiveScope(opts: {
  userId: string
  scopeId: string
  scopes: Scope[]
}): ActiveScopeContext {
  const scope = opts.scopes.find((s) => s.id === opts.scopeId)
  if (!scope) {
    throw new Error('النطاق المطلوب غير موجود')
  }
  if (isPersonalScope(scope)) {
    // Demo desks: any signed-in user uses the personal room as their own.
    return {
      kind: 'personal',
      scope: { ...scope, userId: opts.userId },
      memory: scope.privateMemory,
      userId: opts.userId,
    }
  }
  // Demo shared rooms: membership list is illustrative; signed-in teammates join.
  return {
    kind: 'shared',
    scope,
    memory: scope.sharedMemory,
    allowedSkills: scope.skills,
    userId: opts.userId,
  }
}

export function getScopeMemory(ctx: ActiveScopeContext): string[] {
  return ctx.memory
}

export function buildPromptContext(ctx: ActiveScopeContext): string {
  const memoryBlock = ctx.memory.length
    ? ctx.memory.map((m, i) => `${i + 1}. ${m}`).join('\n')
    : 'لا توجد ذكريات محفوظة.'
  const skills =
    ctx.kind === 'shared' && ctx.allowedSkills?.length
      ? `\nالمهارات المسموحة: ${ctx.allowedSkills.join(', ')}`
      : ''
  const nameAr = ctx.scope.nameAr
  return `أنت مشارك في مساحة العمل «${nameAr}» (${ctx.kind === 'personal' ? 'شخصية' : 'مشتركة'}).
سياق الذاكرة:
${memoryBlock}${skills}
شارك في الغرفة كوكيل له هوية واضحة، وابنِ على عمل البشر والوكلاء الآخرين.`
}

export function scopeKind(scope: Scope): 'personal' | 'shared' {
  return isPersonalScope(scope) ? 'personal' : 'shared'
}

/** Demo scopes — personal desks + shared rooms (qm / Buzz style). */
export const DEMO_SCOPES: Scope[] = [
  {
    id: 'personal-demo',
    nameAr: 'مساحتي الشخصية',
    descriptionAr: 'مكتبك الخاص مع الوكيل — ذاكرة وملفات منفصلة.',
    userId: 'user-1',
    keychain: {},
    privateMemory: [
      'يفضل المستخدم التقارير بالعربية الفصحى.',
      'أوقات العمل المعتادة: الأحد–الخميس، توقيت الرياض.',
    ],
  },
  {
    id: 'personal-research',
    nameAr: 'مكتب البحث',
    descriptionAr: 'مسودات وتحليلات شخصية قبل مشاركتها مع الفريق.',
    userId: 'user-1',
    keychain: {},
    privateMemory: ['مشاريع قيد البحث: سياسات الموافقات، تدقيق SDAIA.'],
  },
  {
    id: 'shared-demo',
    nameAr: 'غرفة الفريق',
    descriptionAr: 'بشر ووكلاء يعملون على نفس السياق.',
    members: ['user-1', 'user-2', 'user-3'],
    memberLabelsAr: ['هوى', 'سارة', 'فهد'],
    agentLabelsAr: ['وكيل التقارير', 'وكيل الامتثال'],
    sharedMemory: [
      'قرار الأسبوع: اعتماد سياسة الموافقات التلقائية للأدوات منخفضة المخاطر.',
      'اللغة الرسمية للغرفة: العربية الفصحى المهنية.',
    ],
    skills: ['arabic_report_generator', 'zatca_e_invoicing_checker'],
  },
  {
    id: 'shared-ops',
    nameAr: 'غرفة العمليات',
    descriptionAr: 'متابعات تشغيلية، مهام خلفية، وتنبيهات القنوات.',
    members: ['user-1', 'user-2'],
    memberLabelsAr: ['هوى', 'سارة'],
    agentLabelsAr: ['وكيل الجدولة', 'وكيل القنوات'],
    sharedMemory: [
      'قنوات التنبيه: تيليجرام + واتساب مربوطة بهذه المساحة.',
      'Cron الليلي يرسل ملخصاً عند الساعة 09:00 بتوقيت الرياض.',
    ],
    skills: ['cron_digest', 'channel_notify'],
  },
]
