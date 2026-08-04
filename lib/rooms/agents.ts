/** Named room agents (Buzz/qm-style participants). */
export type RoomAgent = {
  id: string
  nameAr: string
  slug: string
  systemPromptAr: string
  avatarHue: number
  /** User-created agent (can be deleted). */
  custom?: boolean
  /** Preferred harness model slug (shares Gemini/GLM API keys). */
  preferredModel?: string
  /** Short task assignment shown in UI and injected into the system prompt. */
  taskAr?: string
}

export type AgentCollabMode = 'solo' | 'team'

export const AGENT_MODEL_PRESETS = [
  { slug: 'gemini-3.1-pro', labelAr: 'تحليل معمق · Gemini', provider: 'google' },
  { slug: 'claude-opus-4-8', labelAr: 'تحليل معمق · Opus (AgentRouter)', provider: 'agentrouter' },
  { slug: 'gpt-5.6-sol', labelAr: 'متوازن · GPT (AgentRouter)', provider: 'agentrouter' },
  { slug: 'claude-sonnet-4', labelAr: 'تحليل معمق · Claude 4', provider: 'openrouter' },
  { slug: 'glm-4.5', labelAr: 'متوازن · GLM', provider: 'glm' },
] as const

export const BUILTIN_ROOM_AGENTS: RoomAgent[] = [
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
      'أنت وكيل القنوات. اربط تيليجرام بالغرفة وأبلغ عن حالة الإرسال.',
    avatarHue: 280,
  },
  {
    id: 'agent-desk',
    nameAr: 'الوكيل الشخصي',
    slug: 'desk',
    systemPromptAr:
      'أنت الوكيل الشخصي لمكتب المستخدم اليومي. ساعد في المهام السريعة والتنظيم والملفات الخاصة. كن موجزاً وعملياً.',
    avatarHue: 150,
  },
  {
    id: 'agent-research',
    nameAr: 'وكيل البحث',
    slug: 'research',
    systemPromptAr:
      'أنت وكيل البحث والمسودات. هذه مساحة للتحليل والتجربة قبل مشاركة أي شيء مع الفريق. اكتب مسودات، قارن خيارات، واذكر مصادر/فجوات — ولا تفترض أن العمل نهائي للنشر.',
    avatarHue: 45,
  },
]

/** @deprecated use BUILTIN_ROOM_AGENTS — kept for server routes without roster store */
export const ROOM_AGENTS = BUILTIN_ROOM_AGENTS

export const SCOPE_AGENT_IDS: Record<string, string[]> = {
  'shared-demo': ['agent-reports', 'agent-compliance'],
  'shared-ops': ['agent-cron', 'agent-channels'],
  'personal-demo': ['agent-desk'],
  'personal-research': ['agent-research'],
}

/** Built-in default seating (no custom roster). */
export function agentsForScope(scopeId: string): RoomAgent[] {
  const ids = SCOPE_AGENT_IDS[scopeId] || ['agent-desk']
  return ids
    .map((id) => BUILTIN_ROOM_AGENTS.find((a) => a.id === id))
    .filter((a): a is RoomAgent => Boolean(a))
}

export function findAgentByMention(
  text: string,
  catalog: RoomAgent[] = BUILTIN_ROOM_AGENTS
): RoomAgent | null {
  const mention = text.match(/@([\u0600-\u06FFa-zA-Z0-9_\-]+)/)
  if (!mention) return null
  const token = mention[1]
  return (
    catalog.find(
      (a) =>
        a.slug === token ||
        a.nameAr.replace(/\s+/g, '') === token ||
        a.nameAr.includes(token)
    ) || null
  )
}

/** Parse leading @mention; returns agent + prompt without the mention token. */
export function resolveMentionHandoff(
  prompt: string,
  catalog: RoomAgent[] = BUILTIN_ROOM_AGENTS
): {
  agent: RoomAgent | null
  cleanPrompt: string
} {
  const trimmed = prompt.trim()
  const m = trimmed.match(/^@([\u0600-\u06FFa-zA-Z0-9_\-]+)\s*/)
  if (!m) return { agent: null, cleanPrompt: trimmed }
  const token = m[1]
  const agent =
    catalog.find(
      (a) =>
        a.slug === token ||
        a.nameAr === token ||
        a.nameAr.replace(/\s+/g, '') === token.replace(/\s+/g, '')
    ) || null
  const cleanPrompt = trimmed.slice(m[0].length).trim() || trimmed
  return { agent, cleanPrompt }
}
