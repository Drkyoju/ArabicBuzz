/**
 * Cheap Arabic heuristics: bump power / model / hand off for one run only.
 * Habitual seat stays light (flash + منخفضة); escalation is ephemeral.
 */

import {
  RUN_EFFORT_LABELS_AR,
  type RunEffort,
} from '@/lib/ai/run-effort'
import {
  agentModelLabelAr,
  ROOM_AGENT_DEFAULT_EFFORT,
  ROOM_AGENT_DEFAULT_MODEL,
  type RoomAgent,
} from '@/lib/rooms/agents'

export type AdaptEffort = RunEffort
export type AdaptModelTier = 'flash' | 'balanced' | 'strong'

export type RunAdaptPlan = {
  effort: RunEffort
  modelSlug: string
  /** Preferred seat for this run (may differ from the caller’s seat). */
  handoffAgent: RoomAgent | null
  noticesAr: string[]
  /** Why we adapted (for logs / debug). */
  reasons: string[]
}

const HIGH_DEPTH_RE =
  /(?:حل[ّل]ل|تحليل\s+عميق|قارن|مقارنة|خط[ةه]\s+عمل|استراتيج|قرار|مخاطر|امتثال|قانون|لائح|عقد|مراجعة\s+دقيق|بالتفصيل|مفص[ّل]|خطوة\s+بخطوة|لماذا|كيف\s+ن)/i

const MEDIUM_TOOLS_RE =
  /(?:ابحث|دور|لخ[ّص]|لخص|عد[ّل]|استخرج|حو[ّل]|أنشئ|انشئ|اكتب|أرسل|ارسل|ارفع|نز[ّل]|نزل|افتح|ور[ّ]?ني|جدول|ملف|مستند|pdf|xlsx|docx|بريد|تقويم|تيليجرام|drive|درايف)/i

const STRONG_MODEL_RE =
  /(?:مستند\s+طويل|عشرات\s+الصفحات|تحليل\s+قانون|رأي\s+قانوني|موازنة|ميزانية|محاسبة|ترجمة\s+دقيق|كود\s+معق[ّد]|معمارية|architecture|refactor)/i

/** Specialty → preferred builtin slug / id fragment. */
const SPECIALTY_HINTS: Array<{
  re: RegExp
  slugHints: string[]
  labelAr: string
}> = [
  {
    re: /(?:امتثال|مخاطر|HITL|موافقة|حساس|قانون|لائح)/i,
    slugHints: ['compliance', 'agent-compliance'],
    labelAr: 'الامتثال',
  },
  {
    re: /(?:تقرير|ملخص\s+تنفيذي|ملخصات|داشبورد|مؤشر)/i,
    slugHints: ['reports', 'agent-reports'],
    labelAr: 'التقارير',
  },
  {
    re: /(?:جدولة|cron|خلفية|مهام\s+مجدولة|تذكير)/i,
    slugHints: ['scheduler', 'agent-cron'],
    labelAr: 'الجدولة',
  },
  {
    re: /(?:تيليجرام|قناة|قنوات|واتساب|whatsapp)/i,
    slugHints: ['channels', 'agent-channels'],
    labelAr: 'القنوات',
  },
  {
    re: /(?:بحث|مسودة|مسودات|تجربة|قارن\s+خيارات)/i,
    slugHints: ['research', 'agent-research'],
    labelAr: 'البحث',
  },
]

const MODEL_LADDER = [
  ROOM_AGENT_DEFAULT_MODEL,
  'gemini-3.1-pro',
  'glm-4.5',
  'gpt-5.6-sol',
  'claude-opus-5',
] as const

function effortRank(e: RunEffort): number {
  return e === 'LOW' ? 0 : e === 'MEDIUM' ? 1 : 2
}

function maxEffort(a: RunEffort, b: RunEffort): RunEffort {
  return effortRank(a) >= effortRank(b) ? a : b
}

function pickModelForTier(
  tier: AdaptModelTier,
  seatModel?: string | null
): string {
  const seat = (seatModel || '').trim()
  if (tier === 'flash') {
    return seat && seat !== ROOM_AGENT_DEFAULT_MODEL
      ? seat
      : ROOM_AGENT_DEFAULT_MODEL
  }
  if (tier === 'balanced') {
    // Prefer stronger Gemini if seat is already flash/light.
    if (seat && seat !== ROOM_AGENT_DEFAULT_MODEL && !seat.includes('flash')) {
      return seat
    }
    return 'gemini-3.1-pro'
  }
  // strong — climb ladder past flash
  if (seat && !seat.includes('flash') && seat !== ROOM_AGENT_DEFAULT_MODEL) {
    return seat
  }
  return 'claude-opus-5'
}

function findSpecialtyAgent(
  prompt: string,
  catalog: RoomAgent[],
  currentId?: string
): RoomAgent | null {
  for (const hint of SPECIALTY_HINTS) {
    if (!hint.re.test(prompt)) continue
    const hit =
      catalog.find((a) =>
        hint.slugHints.some(
          (h) =>
            a.slug === h ||
            a.id === h ||
            a.id.endsWith(h.replace(/^agent-/, '')) ||
            a.slug.includes(h)
        )
      ) ||
      catalog.find((a) =>
        hint.slugHints.some((h) =>
          (a.taskAr || '').includes(hint.labelAr.slice(0, 4))
        )
      )
    if (hit && hit.id !== currentId) return hit
  }
  return null
}

/**
 * Plan ephemeral adaptations for one agent run.
 * Respects an explicit user effort floor (seat / composer) — never lowers it.
 * Never returns MAX (removed).
 */
export function planRoomRunAdaptation(opts: {
  prompt: string
  /** Seat / composer baseline (habitual). */
  baseEffort?: RunEffort | string | null
  baseModel?: string | null
  currentAgent?: RoomAgent | null
  catalog?: RoomAgent[]
  hasAttachments?: boolean
  /** Skip handoff when user already @mentioned or team fan-out. */
  allowHandoff?: boolean
}): RunAdaptPlan {
  const prompt = (opts.prompt || '').trim()
  const baseEffort = ((): RunEffort => {
    const v = String(opts.baseEffort || '')
      .trim()
      .toUpperCase()
    if (v === 'MEDIUM') return 'MEDIUM'
    if (v === 'HIGH' || v === 'MAX') return 'HIGH'
    if (v === 'LOW') return 'LOW'
    return ROOM_AGENT_DEFAULT_EFFORT
  })()
  const baseModel = opts.baseModel?.trim() || ROOM_AGENT_DEFAULT_MODEL
  const catalog = opts.catalog || []
  const noticesAr: string[] = []
  const reasons: string[] = []

  let effort: RunEffort = baseEffort
  let modelTier: AdaptModelTier = 'flash'
  let handoffAgent: RoomAgent | null = null

  const long = prompt.length >= 280
  const veryLong = prompt.length >= 900
  const needsTools =
    opts.hasAttachments || MEDIUM_TOOLS_RE.test(prompt) || long
  const needsDepth = HIGH_DEPTH_RE.test(prompt) || veryLong
  const needsStrong = STRONG_MODEL_RE.test(prompt)

  if (needsTools) {
    effort = maxEffort(effort, 'MEDIUM')
    reasons.push('tools')
  }
  if (needsDepth) {
    effort = maxEffort(effort, 'HIGH')
    reasons.push('depth')
    modelTier = 'balanced'
  }
  if (needsStrong) {
    effort = maxEffort(effort, 'HIGH')
    reasons.push('strong-model')
    modelTier = 'strong'
  }
  if (opts.hasAttachments && !needsDepth) {
    effort = maxEffort(effort, 'MEDIUM')
    modelTier = modelTier === 'flash' ? 'balanced' : modelTier
    reasons.push('attachments')
  }

  if (opts.allowHandoff !== false && catalog.length > 0) {
    handoffAgent = findSpecialtyAgent(
      prompt,
      catalog,
      opts.currentAgent?.id
    )
    if (handoffAgent) reasons.push(`handoff:${handoffAgent.slug}`)
  }

  // Model: only escalate above seat/default when classifier asks.
  let modelSlug = baseModel
  if (modelTier === 'balanced' || modelTier === 'strong') {
    const escalated = pickModelForTier(modelTier, baseModel)
    if (escalated !== baseModel) {
      modelSlug = escalated
    } else if (baseModel === ROOM_AGENT_DEFAULT_MODEL || baseModel.includes('flash')) {
      modelSlug =
        modelTier === 'strong' ? MODEL_LADDER[4] : MODEL_LADDER[1]
    }
  }

  if (effortRank(effort) > effortRank(baseEffort)) {
    noticesAr.push(`رُفعت القوة إلى ${RUN_EFFORT_LABELS_AR[effort]}`)
  }
  if (modelSlug !== baseModel) {
    noticesAr.push(`بُدّل النموذج إلى ${agentModelLabelAr(modelSlug)}`)
  }
  if (handoffAgent) {
    noticesAr.push(`نُقل إلى @${handoffAgent.slug} (${handoffAgent.nameAr})`)
  }

  return {
    effort,
    modelSlug,
    handoffAgent,
    noticesAr,
    reasons,
  }
}

/** Habitual seat prefs after a run (light default). */
export function habitualSeatDefaults(): {
  preferredModel: string
  preferredEffort: RunEffort
} {
  return {
    preferredModel: ROOM_AGENT_DEFAULT_MODEL,
    preferredEffort: ROOM_AGENT_DEFAULT_EFFORT,
  }
}
