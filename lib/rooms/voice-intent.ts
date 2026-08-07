import type { RoomAgent } from '@/lib/rooms/agents'
import { isAgentTeamBroadcastToken } from '@/lib/rooms/agents'

export type RoomMessageIntentKind =
  | 'task'
  | 'broadcast'
  | 'directed'
  | 'casual'

export type RoomMessageIntent = {
  kind: RoomMessageIntentKind
  /** Agents to run (empty = caller picks desk/first ready). */
  agents: RoomAgent[]
  /** Prompt without wake / soft-mention prefixes. */
  cleanPrompt: string
  /** Matched wake or request cue (for UI / logs). */
  matchedAr?: string
  /** Short Arabic label for triage. */
  labelAr: string
}

/** Soft wake phrases — spoken without typing @. */
const WAKE_ALL_RE =
  /^(?:يا\s*)?(?:الوكلاء|وكلاء|للوكلاء|للجميع|الجميع|فريق|all|team)\s*[:：\-–]?\s*/i

const WAKE_TASK_PREFIX_RE =
  /^(?:مهمة|طلب|نفّذ|نفذ|ابغا|أبغا|أبغى|ابغى)\s*[:：\-–]\s*/i

/** Directed: «يا وكيل١ …» / «يا reports …» without @. */
const WAKE_YA_AGENT_RE =
  /^يا\s+([\u0600-\u06FFa-zA-Z0-9_\-]+)\s*[:：\-–,]?\s*/i

/**
 * Gulf/MSA request cues — treat as actionable work (fetch/edit/search), not idle chat.
 */
const ACTION_REQUEST_RE =
  /(?:^|[\s،,])(?:أبغا|ابغا|أبغى|ابغى|أبي|ابي|أريد|اريد|اريد|عايز|بدي|أبي|ودي|سوي|سوّي|سوّ|عدل|عدّل|عدلي|عدّلي|جيب|هات|افتح|ورّني|وريني|ابحث|دور|لخّص|لخص|أنشئ|انشئ|اكتب|أرسل|ارسل|ارفع|نزّل|نزل|حوّل|استخرج|استبدل|صحّح|صحح|احذف|امسح)(?:\s|$|[\u0600-\u06FF])/u

const FILE_ASK_RE =
  /(?:اللائحة|اللائحه|الملف|مستند|وثيقة|ورد|وورد|excel|xlsx|pdf|pptx|العقد|النموذج|القائمة|جدول)/i

const CASUAL_ONLY_RE =
  /^(?:السلام\s*عليكم|سلام|مرحبا|مرحباً|أهلا|اهلا|هلا|صباح\s*الخير|مساء\s*الخير|تصبحون\s*على\s*خير|شكرا|شكراً|مشكور|تسلم|تمام|طيب|اوك|أوك|ok|okay|هههه+|lol|👍|🙏|❤️|✅)[\s!.。]*$/i

function westDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

function matchAgentToken(
  token: string,
  catalog: RoomAgent[]
): RoomAgent | null {
  const compact = token.replace(/\s+/g, '')
  const lower = token.toLowerCase()
  const west = westDigits(compact)
  return (
    catalog.find((a) => {
      if (a.id === token || a.id === `agent-${token}`) return true
      if (a.slug === token || a.slug.toLowerCase() === lower) return true
      const nameFlat = a.nameAr.replace(/\s+/g, '')
      const nameWest = westDigits(nameFlat)
      return (
        a.nameAr === token ||
        nameFlat === compact ||
        nameWest === west ||
        nameFlat.includes(compact) ||
        compact.includes(nameFlat)
      )
    }) || null
  )
}

function isActionableRequest(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (CASUAL_ONLY_RE.test(t)) return false
  if (ACTION_REQUEST_RE.test(t)) return true
  if (FILE_ASK_RE.test(t) && t.length >= 6) return true
  // Imperative / question that looks like work
  if (
    /(?:من\s+فضلك|لو\s*سمحت|ممكن|هل\s+يمكنك|وش\s+حالة|وين\s+(?:ال)?ملف)/i.test(
      t
    )
  ) {
    return true
  }
  // Longer messages in a work room are usually requests
  if (t.length >= 40 && /[\u0600-\u06FF]{4,}/.test(t)) return true
  return false
}

/**
 * Classify room text/voice transcript for routing without requiring @mention.
 * Used for shared-room auto-watch and voice «أبغا…» requests.
 */
export function resolveRoomMessageIntent(
  raw: string,
  catalog: RoomAgent[],
  opts?: { preferDeskId?: string }
): RoomMessageIntent {
  const trimmed = (raw || '').trim()
  if (!trimmed) {
    return {
      kind: 'casual',
      agents: [],
      cleanPrompt: '',
      labelAr: 'فارغ',
    }
  }

  // Explicit @tokens already handled upstream; still strip soft wakes here.
  let rest = trimmed
  let matchedAr: string | undefined

  const allWake = rest.match(WAKE_ALL_RE)
  if (allWake) {
    matchedAr = allWake[0].trim()
    rest = rest.slice(allWake[0].length).trim() || trimmed
    return {
      kind: 'broadcast',
      agents: catalog.slice(),
      cleanPrompt: rest,
      matchedAr,
      labelAr: 'للوكلاء جميعاً',
    }
  }

  // «أبغا للجميع …» mid-style
  if (
    /(?:أبغا|ابغا|أبغى|ابغى|مهمة|طلب)\s+(?:للجميع|للوكلاء|من\s+الجميع)/i.test(
      rest
    )
  ) {
    return {
      kind: 'broadcast',
      agents: catalog.slice(),
      cleanPrompt: rest,
      matchedAr: 'أبغا للجميع',
      labelAr: 'للوكلاء جميعاً',
    }
  }

  const ya = rest.match(WAKE_YA_AGENT_RE)
  if (ya) {
    const token = ya[1]
    if (!isAgentTeamBroadcastToken(token)) {
      const agent = matchAgentToken(token, catalog)
      if (agent) {
        rest = rest.slice(ya[0].length).trim() || trimmed
        return {
          kind: 'directed',
          agents: [agent],
          cleanPrompt: rest,
          matchedAr: ya[0].trim(),
          labelAr: `توجيه لـ ${agent.nameAr}`,
        }
      }
    } else {
      rest = rest.slice(ya[0].length).trim() || trimmed
      return {
        kind: 'broadcast',
        agents: catalog.slice(),
        cleanPrompt: rest,
        matchedAr: ya[0].trim(),
        labelAr: 'للوكلاء جميعاً',
      }
    }
  }

  const taskPrefix = rest.match(WAKE_TASK_PREFIX_RE)
  if (taskPrefix) {
    matchedAr = taskPrefix[0].trim()
    rest = rest.slice(taskPrefix[0].length).trim() || trimmed
    return {
      kind: 'task',
      agents: [],
      cleanPrompt: rest,
      matchedAr,
      labelAr: 'مهمة / طلب',
    }
  }

  if (CASUAL_ONLY_RE.test(rest)) {
    return {
      kind: 'casual',
      agents: [],
      cleanPrompt: rest,
      labelAr: 'دردشة قصيرة',
    }
  }

  if (isActionableRequest(rest)) {
    return {
      kind: 'task',
      agents: [],
      cleanPrompt: rest,
      matchedAr: 'طلب عمل',
      labelAr: 'طلب للتنفيذ',
    }
  }

  // Default in shared rooms: still glance (caller runs one watcher).
  void opts
  return {
    kind: 'casual',
    agents: [],
    cleanPrompt: rest,
    labelAr: 'مراجعة سريعة',
  }
}

/** Pick one desk/default watcher from ready agents (avoid fan-out spam). */
export function pickWatcherAgent(
  ready: RoomAgent[],
  preferDeskId = 'agent-desk'
): RoomAgent | null {
  if (!ready.length) return null
  return (
    ready.find((a) => a.id === preferDeskId) ||
    ready.find((a) => a.slug === 'desk') ||
    ready[0] ||
    null
  )
}

/**
 * Build the final agent list for a send in a shared room.
 * Always at least one ready watcher unless catalog empty.
 */
export function agentsForSharedRoomMessage(opts: {
  intent: RoomMessageIntent
  readyAgents: RoomAgent[]
  mentioned: RoomAgent[]
  wantsAll: boolean
  teamCap: number
  runTeamCollab: boolean
}): RoomAgent[] {
  const ready = opts.readyAgents
  if (!ready.length) return []

  const cap = Math.max(1, opts.teamCap)
  const readyIds = new Set(ready.map((a) => a.id))

  if (opts.wantsAll || opts.intent.kind === 'broadcast' || opts.runTeamCollab) {
    return ready.slice(0, cap)
  }

  if (opts.mentioned.length) {
    const hit = opts.mentioned.filter((a) => readyIds.has(a.id))
    if (hit.length) return hit.slice(0, cap)
  }

  if (opts.intent.agents.length) {
    const hit = opts.intent.agents.filter((a) => readyIds.has(a.id))
    if (hit.length) return hit.slice(0, cap)
  }

  // task or casual → single watcher (desk/first ready)
  const watcher = pickWatcherAgent(ready)
  return watcher ? [watcher] : []
}

/** Extra system nudge appended to the user prompt for the model. */
export function roomIntentPromptNudge(intent: RoomMessageIntent): string {
  if (intent.kind === 'task' || intent.kind === 'broadcast' || intent.kind === 'directed') {
    return `\n\n[توجيه الغرفة: هذا طلب عمل من رسالة/صوت بدون @ إلزامي. نفّذ فوراً بالأدوات المناسبة (ملفات، بحث، تعديل، تقويم، مهام) وأعد نتيجة قابلة للاستخدام. لا تكتفِ بالوصف.]`
  }
  return `\n\n[توجيه الغرفة: أنت المراقب الجاهز لهذه الرسالة. إن كانت دردشة فقط فأقرّ بجملة قصيرة. إن ظهر طلب عمل (أبغا/ملف/تعديل…) فنفّذه فوراً بالأدوات.]`
}

export const VOICE_MIC_HINT_AR =
  'قل طلبك («أبغا اللائحة…») — الكلام يظهر أثناء الحديث، ثم راجع النسخ العربي قبل الإرسال'

export const VOICE_HOW_TO_AR = `كيف يشتغل الصوت والوكلاء في غرفة الفريق:
• سجّل بالميكروفون: الكلام يظهر أثناء الحديث كمسودة حية في المربع.
• بعد الإيقاف يُستبدل النص بنسخ عربي أدق (Whisper/Gemini…) — عدّله ثم أرسل. لا يُرسل تلقائياً.
• أمثلة: «أبغا اللائحة» · «أبغا الملف كذا» · «عدّل …» · «يا وكيل١ لخّص».
• «أبغا للجميع …» أو «للوكلاء: …» يشغّل المقاعد معاً. يمكن أيضاً @slug لإيقاظ وكيل بعينه.
• كل الوكلاء نائمون افتراضياً. أي رسالة توقظ وكيل١ فقط؛ إن كان يعمل وجاءت رسالة جديدة يُوقظ وكيل٢ ثم ٣…
• بعد انتهاء المهمة يعود الوكيل للنوم (خفيف: Gemini Flash + قوة منخفضة). اضغط المقعد لإيقاظ يدوي.
حدود صادقة: المسودة الحية قد تكون تقريبية؛ النسخ النهائي يعتمد على الميكروفون والشبكة — راجع دائماً قبل الإرسال.`
