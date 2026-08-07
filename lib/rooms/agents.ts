import type { RunEffort } from '@/lib/ai/run-effort'
import {
  HARNESS_TIER_LABELS_AR,
  listAvailableHarnessModels,
  type HarnessModelMeta,
} from '@/lib/ai/harness-catalog'

/** Named room agents (Buzz/qm-style participants). */
export type RoomAgent = {
  id: string
  nameAr: string
  slug: string
  systemPromptAr: string
  avatarHue: number
  /** User-created agent (can be deleted). */
  custom?: boolean
  /** Preferred harness model slug (Gemini / GLM / AgentRouter). */
  preferredModel?: string
  /** Per-agent run power — LOW | MEDIUM | HIGH */
  preferredEffort?: RunEffort
  /**
   * Optional legacy short task label. Seats are request-driven via @mention;
   * new UI no longer sets a fixed mission on the seat.
   */
  taskAr?: string
}

export type AgentCollabMode = 'solo' | 'team'

const PROVIDER_LABEL_AR: Record<string, string> = {
  google: 'Gemini',
  glm: 'GLM',
  agentrouter: 'AgentRouter',
  ollama: 'محلي',
}

/**
 * Default seat model — fastest / cheapest flash-class in the cloud catalog.
 * New agents and one-time remaps use this; users can change per seat.
 */
export const ROOM_AGENT_DEFAULT_MODEL = 'gemini-2.5-flash' as const

/** Default seat power — fewest tool steps / tokens. */
export const ROOM_AGENT_DEFAULT_EFFORT: RunEffort = 'LOW'

/** Room seat models — same cloud catalog as the room composer (no Ollama). */
export function roomAgentModelCatalog(): HarnessModelMeta[] {
  return listAvailableHarnessModels(false).filter(
    (m) =>
      m.provider === 'google' ||
      m.provider === 'glm' ||
      m.provider === 'agentrouter'
  )
}

export function agentModelOptionLabelAr(m: HarnessModelMeta): string {
  const provider = PROVIDER_LABEL_AR[m.provider] || m.provider
  return `${provider} · ${m.labelEn} (${HARNESS_TIER_LABELS_AR[m.tier]})`
}

export function agentModelLabelAr(slug?: string): string {
  if (!slug) return 'نموذج الغرفة'
  const m = roomAgentModelCatalog().find((x) => x.slug === slug)
  if (m) return agentModelOptionLabelAr(m)
  return slug
}

/** @deprecated Prefer roomAgentModelCatalog() — kept for older call sites. */
export const AGENT_MODEL_PRESETS = roomAgentModelCatalog().map((m) => ({
  slug: m.slug,
  labelAr: agentModelOptionLabelAr(m),
  provider: m.provider,
}))

export const BUILTIN_ROOM_AGENTS: RoomAgent[] = [
  {
    id: 'agent-reports',
    nameAr: 'وكيل١',
    slug: 'reports',
    systemPromptAr:
      'أنت وكيل١ (التقارير) في غرفة Arabic Buzz. ركّز على الملخصات التنفيذية بالعربية الفصحى.',
    avatarHue: 170,
    preferredModel: ROOM_AGENT_DEFAULT_MODEL,
    preferredEffort: ROOM_AGENT_DEFAULT_EFFORT,
    taskAr: 'التقارير والملخصات التنفيذية',
  },
  {
    id: 'agent-compliance',
    nameAr: 'وكيل٢',
    slug: 'compliance',
    systemPromptAr:
      'أنت وكيل٢ (الامتثال). نبّه للمخاطر والموافقات البشرية قبل أي إجراء حساس.',
    avatarHue: 25,
    preferredModel: ROOM_AGENT_DEFAULT_MODEL,
    preferredEffort: ROOM_AGENT_DEFAULT_EFFORT,
    taskAr: 'الامتثال والمخاطر',
  },
  {
    id: 'agent-cron',
    nameAr: 'وكيل٣',
    slug: 'scheduler',
    systemPromptAr: 'أنت وكيل٣ (الجدولة). تابع المهام الخلفية وملخصات الـ Cron.',
    avatarHue: 210,
    preferredModel: ROOM_AGENT_DEFAULT_MODEL,
    preferredEffort: ROOM_AGENT_DEFAULT_EFFORT,
    taskAr: 'الجدولة والمهام الخلفية',
  },
  {
    id: 'agent-channels',
    nameAr: 'وكيل٤',
    slug: 'channels',
    systemPromptAr:
      'أنت وكيل٤ (القنوات). اربط تيليجرام بالغرفة وأبلغ عن حالة الإرسال.',
    avatarHue: 280,
    preferredModel: ROOM_AGENT_DEFAULT_MODEL,
    preferredEffort: ROOM_AGENT_DEFAULT_EFFORT,
    taskAr: 'القنوات والتيليجرام',
  },
  {
    id: 'agent-desk',
    nameAr: 'وكيل٥',
    slug: 'desk',
    systemPromptAr:
      'أنت وكيل٥ (المكتب الشخصي). ساعد في المهام السريعة والتنظيم والملفات الخاصة. كن موجزاً وعملياً.',
    avatarHue: 150,
    preferredModel: ROOM_AGENT_DEFAULT_MODEL,
    preferredEffort: ROOM_AGENT_DEFAULT_EFFORT,
    taskAr: 'المكتب اليومي',
  },
  {
    id: 'agent-research',
    nameAr: 'وكيل٦',
    slug: 'research',
    systemPromptAr:
      'أنت وكيل٦ (البحث والمسودات). هذه مساحة للتحليل والتجربة قبل مشاركة أي شيء مع الفريق. اكتب مسودات، قارن خيارات، واذكر مصادر/فجوات — ولا تفترض أن العمل نهائي للنشر.',
    avatarHue: 45,
    preferredModel: ROOM_AGENT_DEFAULT_MODEL,
    preferredEffort: ROOM_AGENT_DEFAULT_EFFORT,
    taskAr: 'البحث والمسودات',
  },
]

/** @deprecated use BUILTIN_ROOM_AGENTS — kept for server routes without roster store */
export const ROOM_AGENTS = BUILTIN_ROOM_AGENTS

/**
 * Soft cap for room seats — keeps the strip readable (~5–8).
 * Owner can still add past this with an explicit confirm in the UI;
 * batch add refuses to blow past the soft cap.
 */
export const ROOM_AGENT_SOFT_CAP = 8
/** Suggested tidy size when pruning cluttered rooms. */
export const ROOM_AGENT_IDEAL_SEATS = 6
/** Default batch size when adding several seats at once. */
export const ROOM_AGENT_BATCH_DEFAULT = 3

export const SCOPE_AGENT_IDS: Record<string, string[]> = {
  // Team room: 4 clear starter seats (owner adds up to soft cap 8)
  'shared-demo': [
    'agent-reports',
    'agent-compliance',
    'agent-cron',
    'agent-desk',
  ],
  'shared-ops': ['agent-cron', 'agent-channels'],
  'personal-demo': BUILTIN_ROOM_AGENTS.map((a) => a.id),
  'personal-research': ['agent-research'],
}

/** Default seating for a scope — personal desks get full agent catalog. */
export function defaultAgentIdsForScope(scopeId: string): string[] {
  if (scopeId.startsWith('personal-u-') || scopeId.startsWith('personal-')) {
    if (scopeId === 'personal-research') return ['agent-research']
    return BUILTIN_ROOM_AGENTS.map((a) => a.id)
  }
  return SCOPE_AGENT_IDS[scopeId] || ['agent-desk']
}

/** Built-in default seating (no custom roster). */
export function agentsForScope(scopeId: string): RoomAgent[] {
  const ids = defaultAgentIdsForScope(scopeId)
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
