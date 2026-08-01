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
    if (scope.userId !== opts.userId) {
      throw new Error('غير مصرح بالوصول إلى هذه المساحة الشخصية')
    }
    return {
      kind: 'personal',
      scope,
      memory: scope.privateMemory,
      userId: opts.userId,
    }
  }
  if (!scope.members.includes(opts.userId)) {
    throw new Error('غير مصرح بالوصول إلى هذه المساحة المشتركة')
  }
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
  return `سياق النطاق (${ctx.kind === 'personal' ? 'شخصي' : 'مشترك'}):\n${memoryBlock}${skills}`
}

export const DEMO_SCOPES: Scope[] = [
  {
    id: 'personal-demo',
    userId: 'user-1',
    keychain: {},
    privateMemory: ['يفضل المستخدم التقارير بالعربية الفصحى.'],
  },
  {
    id: 'shared-demo',
    nameAr: 'مساحة الفريق المشتركة',
    members: ['user-1', 'user-2'],
    sharedMemory: ['قرار الأسبوع: اعتماد سياسة الموافقات التلقائية للأدوات منخفضة المخاطر.'],
    skills: ['arabic_report_generator', 'zatca_e_invoicing_checker'],
  },
]
