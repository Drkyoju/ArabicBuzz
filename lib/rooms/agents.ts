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
  { slug: 'claude-opus-5', labelAr: 'أعلى دقة · Opus 5', provider: 'agentrouter' },
  { slug: 'gemini-3.1-pro', labelAr: 'أعلى دقة', provider: 'google' },
  { slug: 'claude-opus-4-8', labelAr: 'أعلى دقة · تحليل', provider: 'agentrouter' },
  { slug: 'gpt-5.6-sol', labelAr: 'متوازن · عام', provider: 'agentrouter' },
  { slug: 'glm-4.5', labelAr: 'متوازن · تكلفة', provider: 'glm' },
  { slug: 'gemini-2.5-flash', labelAr: 'استجابة سريعة', provider: 'google' },
] as const

export const BUILTIN_ROOM_AGENTS: RoomAgent[] = [
  {
    id: 'agent-reports',
    nameAr: 'وكيل١',
    slug: 'reports',
    systemPromptAr:
      'أنت وكيل١ (التقارير) في غرفة Arabic Buzz. ركّز على الملخصات التنفيذية بالعربية الفصحى.',
    avatarHue: 170,
    taskAr: 'التقارير والملخصات التنفيذية',
  },
  {
    id: 'agent-compliance',
    nameAr: 'وكيل٢',
    slug: 'compliance',
    systemPromptAr:
      'أنت وكيل٢ (الامتثال). نبّه للمخاطر والموافقات البشرية قبل أي إجراء حساس.',
    avatarHue: 25,
    taskAr: 'الامتثال والمخاطر',
  },
  {
    id: 'agent-cron',
    nameAr: 'وكيل٣',
    slug: 'scheduler',
    systemPromptAr: 'أنت وكيل٣ (الجدولة). تابع المهام الخلفية وملخصات الـ Cron.',
    avatarHue: 210,
    taskAr: 'الجدولة والمهام الخلفية',
  },
  {
    id: 'agent-channels',
    nameAr: 'وكيل٤',
    slug: 'channels',
    systemPromptAr:
      'أنت وكيل٤ (القنوات). اربط تيليجرام بالغرفة وأبلغ عن حالة الإرسال.',
    avatarHue: 280,
    taskAr: 'القنوات والتيليجرام',
  },
  {
    id: 'agent-desk',
    nameAr: 'وكيل٥',
    slug: 'desk',
    systemPromptAr:
      'أنت وكيل٥ (المكتب الشخصي). ساعد في المهام السريعة والتنظيم والملفات الخاصة. كن موجزاً وعملياً.',
    avatarHue: 150,
    taskAr: 'المكتب اليومي',
  },
  {
    id: 'agent-research',
    nameAr: 'وكيل٦',
    slug: 'research',
    systemPromptAr:
      'أنت وكيل٦ (البحث والمسودات). هذه مساحة للتحليل والتجربة قبل مشاركة أي شيء مع الفريق. اكتب مسودات، قارن خيارات، واذكر مصادر/فجوات — ولا تفترض أن العمل نهائي للنشر.',
    avatarHue: 45,
    taskAr: 'البحث والمسودات',
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

const MENTION_TOKEN_RE = /@([\u0600-\u06FFa-zA-Z0-9_\-]+)/g

/** Team broadcast tokens — not a single seat. */
export function isAgentTeamBroadcastToken(token: string): boolean {
  return /^(all|team|الجميع|فريق)$/i.test(token)
}

function matchAgentByToken(
  token: string,
  catalog: RoomAgent[]
): RoomAgent | null {
  const compact = token.replace(/\s+/g, '')
  const lower = token.toLowerCase()
  return (
    catalog.find((a) => {
      if (a.id === token || a.id === `agent-${token}`) return true
      if (a.slug === token || a.slug.toLowerCase() === lower) return true
      if (a.nameAr === token || a.nameAr.replace(/\s+/g, '') === compact) {
        return true
      }
      // Eastern/Western digit variants: وكيل1 ↔ وكيل١
      const nameFlat = a.nameAr.replace(/\s+/g, '')
      const tokenWestern = compact.replace(/[٠-٩]/g, (d) =>
        String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      )
      const nameWestern = nameFlat.replace(/[٠-٩]/g, (d) =>
        String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      )
      return nameWestern === tokenWestern || nameFlat === tokenWestern
    }) || null
  )
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Strip matched agent @tokens (Arabic-safe; no \\b after Arabic). */
export function stripAgentMentionTokens(
  text: string,
  agents: RoomAgent[]
): string {
  let out = text
  for (const a of agents) {
    const tokens = [a.slug, a.nameAr.replace(/\s+/g, '')].filter(Boolean)
    for (const t of tokens) {
      out = out.replace(
        new RegExp(`@${escapeRegExp(t)}(?=[\\s@]|$)`, 'gi'),
        ''
      )
    }
  }
  return out.replace(/\s{2,}/g, ' ').trim()
}

export function findAgentByMention(
  text: string,
  catalog: RoomAgent[] = BUILTIN_ROOM_AGENTS
): RoomAgent | null {
  const agents = findMentionedAgents(text, catalog)
  return agents[0] || null
}

/** All distinct agents @mentioned in text (skips @الجميع / @فريق / @all / @team). */
export function findMentionedAgents(
  text: string,
  catalog: RoomAgent[] = BUILTIN_ROOM_AGENTS
): RoomAgent[] {
  if (!text) return []
  const found: RoomAgent[] = []
  const seen = new Set<string>()
  const re = new RegExp(MENTION_TOKEN_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const token = m[1]
    if (isAgentTeamBroadcastToken(token)) continue
    const agent = matchAgentByToken(token, catalog)
    if (!agent || seen.has(agent.id)) continue
    seen.add(agent.id)
    found.push(agent)
  }
  return found
}

/**
 * Parse @mentions; returns first agent (compat), all mentioned seats, and
 * prompt with those tokens removed. Mid-message mentions still hand off.
 */
export function resolveMentionHandoff(
  prompt: string,
  catalog: RoomAgent[] = BUILTIN_ROOM_AGENTS
): {
  agent: RoomAgent | null
  agents: RoomAgent[]
  cleanPrompt: string
} {
  const trimmed = prompt.trim()
  const agents = findMentionedAgents(trimmed, catalog)
  if (agents.length) {
    const cleanPrompt = stripAgentMentionTokens(trimmed, agents)
    return {
      agent: agents[0],
      agents,
      cleanPrompt: cleanPrompt || trimmed,
    }
  }
  return { agent: null, agents: [], cleanPrompt: trimmed }
}
