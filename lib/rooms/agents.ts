/** Named room agents (Buzz/qm-style participants). */
export type RoomAgent = {
  id: string
  nameAr: string
  slug: string
  systemPromptAr: string
  avatarHue: number
}

export const ROOM_AGENTS: RoomAgent[] = [
  {
    id: 'agent-reports',
    nameAr: 'وكيل التقارير',
    slug: 'reports',
    systemPromptAr:
      'أنت وكيل التقارير في غرفة Arabic Buzz. ركّز على الملخصات التنفيذية بالعربية الفصحى.',
    avatarHue: 170,
  },
  {
    id: 'agent-compliance',
    nameAr: 'وكيل الامتثال',
    slug: 'compliance',
    systemPromptAr:
      'أنت وكيل الامتثال. نبّه للمخاطر والموافقات البشرية قبل أي إجراء حساس.',
    avatarHue: 25,
  },
  {
    id: 'agent-cron',
    nameAr: 'وكيل الجدولة',
    slug: 'scheduler',
    systemPromptAr: 'أنت وكيل الجدولة. تابع المهام الخلفية وملخصات الـ Cron.',
    avatarHue: 210,
  },
  {
    id: 'agent-channels',
    nameAr: 'وكيل القنوات',
    slug: 'channels',
    systemPromptAr:
      'أنت وكيل القنوات. اربط تيليجرام/واتساب بالغرفة وأبلغ عن حالة الإرسال.',
    avatarHue: 280,
  },
  {
    id: 'agent-desk',
    nameAr: 'الوكيل الشخصي',
    slug: 'desk',
    systemPromptAr: 'أنت الوكيل الشخصي لمساحة المستخدم. كن موجزاً وعملياً.',
    avatarHue: 150,
  },
]

export const SCOPE_AGENT_IDS: Record<string, string[]> = {
  'shared-demo': ['agent-reports', 'agent-compliance'],
  'shared-ops': ['agent-cron', 'agent-channels'],
  'personal-demo': ['agent-desk'],
  'personal-research': ['agent-desk'],
}

export function agentsForScope(scopeId: string): RoomAgent[] {
  const ids = SCOPE_AGENT_IDS[scopeId] || ['agent-desk']
  return ids
    .map((id) => ROOM_AGENTS.find((a) => a.id === id))
    .filter((a): a is RoomAgent => Boolean(a))
}

export function findAgentByMention(text: string): RoomAgent | null {
  const mention = text.match(/@([\u0600-\u06FFa-zA-Z0-9_\-]+)/)
  if (!mention) return null
  const token = mention[1]
  return (
    ROOM_AGENTS.find(
      (a) =>
        a.slug === token ||
        a.nameAr.replace(/\s+/g, '') === token ||
        a.nameAr.includes(token)
    ) || null
  )
}

/** Parse leading @mention; returns agent + prompt without the mention token. */
export function resolveMentionHandoff(prompt: string): {
  agent: RoomAgent | null
  cleanPrompt: string
} {
  const trimmed = prompt.trim()
  const m = trimmed.match(/^@([\u0600-\u06FFa-zA-Z0-9_\-]+)\s*/)
  if (!m) return { agent: null, cleanPrompt: trimmed }
  const token = m[1]
  const agent =
    ROOM_AGENTS.find(
      (a) =>
        a.slug === token ||
        a.nameAr === token ||
        a.nameAr.replace(/\s+/g, '') === token.replace(/\s+/g, '')
    ) || null
  const cleanPrompt = trimmed.slice(m[0].length).trim() || trimmed
  return { agent, cleanPrompt }
}
