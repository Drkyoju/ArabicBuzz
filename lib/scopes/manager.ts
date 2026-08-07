import type {
  ActiveScopeContext,
  PersonalScope,
  Scope,
  SharedScope,
} from './types'
import { DEFAULT_ROOM_SKILL_IDS } from '@/lib/skills/core-pack'

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
    // Private desk: only this userId — content must never leak to team room.
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
      : `\nالمهارات الأساسية مفعّلة تلقائياً (بريد، تقويم، محاضر، بحث، تيليجرام، مكتب عربي).`
  const nameAr = ctx.scope.nameAr
  return `أنت مشارك في مساحة العمل «${nameAr}» (${ctx.kind === 'personal' ? 'شخصية' : 'مشتركة'}).
سياق الذاكرة:
${memoryBlock}${skills}
شارك في الغرفة كوكيل له هوية واضحة، وابنِ على عمل البشر والوكلاء الآخرين.`
}

export function scopeKind(scope: Scope): 'personal' | 'shared' {
  return isPersonalScope(scope) ? 'personal' : 'shared'
}

/** Demo scopes — legacy templates; live personal desk is personal-u-{userId}. */
export const DEMO_SCOPES: Scope[] = [
  {
    id: 'personal-demo',
    nameAr: 'مساحتي الشخصية',
    descriptionAr:
      'مساحتي الشخصية — خاصة بك وحدك. الرسائل والملفات والوكلاء لا تظهر لغرفة الفريق.',
    userId: 'user-1',
    keychain: {},
    privateMemory: [
      'يفضل المستخدم التقارير بالعربية الفصحى.',
      'أوقات العمل: الأحد–الخميس، توقيت الرياض.',
      'هذه مساحة خاصة — لا تُشارك مع غرفة الفريق تلقائياً.',
    ],
  },
  {
    id: 'personal-research',
    nameAr: 'مكتب البحث',
    descriptionAr: 'مسودات قبل مشاركة الفريق.',
    userId: 'user-1',
    keychain: {},
    privateMemory: [
      'مساحة مسودات — انقل الخلاصة لغرفة مشتركة عند الجاهزية.',
    ],
  },
  {
    id: 'shared-demo',
    nameAr: 'غرفة الفريق',
    descriptionAr:
      'محادثة الفريق والوكلاء بـ @ — شغّل أو أوقف «الوكلاء يعملون معنا».',
    members: ['user-1'],
    memberLabelsAr: [],
    agentLabelsAr: ['وكيل١', 'وكيل٢'],
    sharedMemory: [
      'اللغة الرسمية للغرفة: العربية الفصحى المهنية.',
      'هذه غرفة الفريق الأساسية — الموظفون والوكلاء معاً.',
    ],
    skills: [...DEFAULT_ROOM_SKILL_IDS],
  },
  {
    id: 'shared-ops',
    nameAr: 'غرفة العمليات',
    descriptionAr: 'تشغيل وتنبيهات.',
    members: ['user-1'],
    memberLabelsAr: [],
    agentLabelsAr: ['وكيل٣', 'وكيل٤'],
    sharedMemory: [
      'قناة التنبيه: تيليجرام عند تفعيله.',
    ],
    skills: [...DEFAULT_ROOM_SKILL_IDS],
  },
]
