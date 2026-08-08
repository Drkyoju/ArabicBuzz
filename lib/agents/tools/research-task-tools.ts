/**
 * When native tools appear insufficient: search web + GitHub for free
 * skills/MCPs, map to known free builtins (pdf-lib etc.), and either:
 * - return executeNext for immediate auto-run, OR
 * - return MSA paid-gate reply only after free is exhausted.
 * Never pretends success. Never asks the user for routine work.
 */
import { executeWebSearch, type WebSearchHit } from '@/lib/agents/tools/web-tools'
import {
  formatFreeExecuteNextAr,
  mapSuggestionsToBuiltinFreeTools,
  mapTaskToBuiltinFreeTools,
  type FreeExecuteHint,
} from '@/lib/agents/tools/free-execute-map'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'

export type ResearchToolSuggestion = {
  title: string
  url: string
  snippet: string
  /** 0 = free / open-source preferred; higher = more costly or unclear */
  costRank: number
  costLabelAr: string
  kind: 'mcp' | 'skill' | 'tool' | 'other'
}

export type ResearchTaskToolsResult = {
  ok: boolean
  /** true only when no free executable path — user may need paid key */
  blocked: boolean
  /** Free builtins ready to run now — agent must execute these */
  canExecuteFree: boolean
  executeNext: FreeExecuteHint[]
  task: string
  suggestions: ResearchToolSuggestion[]
  providers: string[]
  /**
   * MSA for Telegram:
   * - free path → execute instructions (agent runs tools, bot delivers)
   * - paid gate → cheapest paid options after free exhausted
   */
  messageAr: string
}

const FREE_HINT =
  /\b(free|open[\s-]?source|foss|mit\b|apache|gpl|no[\s-]?key|no[\s-]?api[\s-]?key|self[\s-]?host|gratis|مجاني|مفتوح)\b/i
const LOW_COST_HINT =
  /\b(freemium|free[\s-]?tier|hobby|trial|low[\s-]?cost|مجاني جزئي|طبقة مجانية)\b/i
const PAID_HINT =
  /\b(paid|pricing|subscription|enterprise|pro\b|premium|\$|usd|billing|مدفوع|اشتراك)\b/i
const MCP_HINT = /\bmcp\b|model\s*context\s*protocol|mcp[\s-]?server/i
const SKILL_HINT = /\b(skill|skills?\.md|agent[\s-]?skill|cursor[\s-]?skill)\b/i
const TOOL_HINT = /\b(tool|cli|api|sdk|plugin|extension|integrator)\b/i

function classifyKind(text: string): ResearchToolSuggestion['kind'] {
  if (MCP_HINT.test(text)) return 'mcp'
  if (SKILL_HINT.test(text)) return 'skill'
  if (TOOL_HINT.test(text)) return 'tool'
  return 'other'
}

function scoreHit(hit: WebSearchHit): ResearchToolSuggestion {
  const blob = `${hit.title} ${hit.snippet} ${hit.url}`
  let costRank = 2
  let costLabelAr = 'تكلفة غير واضحة'
  if (FREE_HINT.test(blob) || /github\.com/i.test(hit.url)) {
    costRank = 0
    costLabelAr = 'مجاني / مفتوح المصدر (مفضّل)'
  } else if (LOW_COST_HINT.test(blob)) {
    costRank = 1
    costLabelAr = 'منخفض التكلفة / طبقة مجانية'
  } else if (PAID_HINT.test(blob)) {
    costRank = 3
    costLabelAr = 'قد يكون مدفوعاً'
  }
  if (/github\.com/i.test(hit.url)) costRank = Math.max(0, costRank - 0.25)
  if (/modelcontextprotocol|mcp\.so|smithery|glama\.ai/i.test(hit.url)) {
    costRank = Math.max(0, costRank - 0.15)
  }
  return {
    title: hit.title.slice(0, 120),
    url: hit.url,
    snippet: hit.snippet.slice(0, 220),
    costRank,
    costLabelAr,
    kind: classifyKind(blob),
  }
}

function kindLabelAr(kind: ResearchToolSuggestion['kind']): string {
  switch (kind) {
    case 'mcp':
      return 'MCP'
    case 'skill':
      return 'مهارة / Skill'
    case 'tool':
      return 'أداة'
    default:
      return 'حل'
  }
}

const FREE_RANK_MAX = 1.25

function formatSuggestionLine(
  s: ResearchToolSuggestion,
  index: number
): string {
  const n = ['١', '٢', '٣'][index] || String(index + 1)
  return `${n}) [${kindLabelAr(s.kind)}] ${s.title} — ${s.costLabelAr}\n${s.url}`
}

/**
 * Paid gate only — after free research + builtin mapping failed to yield
 * an executable path. Never claims success.
 */
export function formatBlockedTaskReplyAr(opts: {
  suggestions: ResearchToolSuggestion[]
  researched: boolean
}): string {
  const free = opts.suggestions
    .filter((s) => s.costRank <= FREE_RANK_MAX)
    .slice(0, 3)
  const paid = opts.suggestions
    .filter((s) => s.costRank > FREE_RANK_MAX)
    .slice(0, 3)

  const lines: string[] = [
    'تعذّر تنفيذ المهمة بالأدوات الحالية.',
    opts.researched
      ? 'بحثت أولاً عن حلول مجانية (ويب + GitHub: مهارات / MCP / أدوات) وجرّبت المكتبات المدمجة…'
      : 'حاولت المسار المجاني أولاً…',
    'لم أستطع تشغيل مسار مجاني تلقائياً — هذه بوابة الدفع الوحيدة التي أقاطعك لأجلها.',
  ]

  if (free.length > 0) {
    lines.push(
      'وُجدت إشارات مجانية لكن تحتاج تثبيتاً/مفتاحاً خارجياً (لم أشغّل كوداً بعيداً غير موثوق):'
    )
    free.forEach((s, i) => lines.push(formatSuggestionLine(s, i)))
  }

  if (paid.length > 0) {
    lines.push('بدائل مدفوعة الأرخص (بعد استنفاد المجاني):')
    paid.forEach((s, i) => lines.push(formatSuggestionLine(s, i)))
  } else if (free.length === 0) {
    lines.push(
      'لم أجد نتائج مباشرة — أقترح مجاناً أولاً عند التثبيت: ١) مهارة Cursor من GitHub ٢) خادم MCP مفتوح المصدر (self-host) ٣) CLI مجاني.',
      'إن احتجت مدفوعاً: اختر الأرخص بطبقة مجانية/تجريبية ثم الاشتراك.'
    )
  }

  lines.push('أقترح (من الأرخص): المجاني أولاً، ثم المدفوع الأرخص إن لزم.')
  lines.push(
    'لم أدّعِ النجاح — إن وفّرت مفتاح/موافقة للأرخص أكمّل تلقائياً. لن أطلب تأكيداً للعمل الروتيني.'
  )
  lines.push('إن وفّرت مفتاح/تثبيت أحدها أقدر أكمّل.')
  return lines.join('\n')
}

function isRelevantHit(hit: WebSearchHit, task: string): boolean {
  const blob = `${hit.title} ${hit.snippet} ${hit.url}`.toLowerCase()
  const taskBits = task
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
    .slice(0, 8)
  const hasCapabilityCue =
    MCP_HINT.test(blob) ||
    SKILL_HINT.test(blob) ||
    TOOL_HINT.test(blob) ||
    /github\.com|awesome|registry|marketplace/i.test(blob)
  if (!hasCapabilityCue && taskBits.length === 0) return false
  if (hasCapabilityCue) return true
  return taskBits.some((w) => blob.includes(w))
}

async function searchOnce(
  query: string
): Promise<{ hits: WebSearchHit[]; providers: string[] }> {
  try {
    const out = (await executeWebSearch('web_search', { query })) as {
      results?: WebSearchHit[]
      providers?: string[]
      ok?: boolean
    }
    return {
      hits: Array.isArray(out.results) ? out.results : [],
      providers: Array.isArray(out.providers) ? out.providers : [],
    }
  } catch (e) {
    console.warn(
      '[research_task_tools] search failed',
      query,
      e instanceof Error ? e.message : e
    )
    return { hits: [], providers: [] }
  }
}

function emptyPaidGate(task: string, researched: boolean): ResearchTaskToolsResult {
  return {
    ok: false,
    blocked: true,
    canExecuteFree: false,
    executeNext: [],
    task,
    suggestions: [],
    providers: [],
    messageAr: formatBlockedTaskReplyAr({
      suggestions: [],
      researched,
    }),
  }
}

/**
 * Research free paths; prefer mapping to builtins and instructing immediate execute.
 */
export async function executeResearchTaskTools(
  _n: string,
  params: Record<string, unknown>
): Promise<ResearchTaskToolsResult> {
  const task = String(
    params.task || params.taskAr || params.query || params.queryAr || ''
  ).trim()
  if (!task) {
    return emptyPaidGate('', false)
  }

  // Prefer builtins immediately — no web needed when we already ship the lib.
  const builtinFirst = mapTaskToBuiltinFreeTools(task)
  if (builtinFirst.length) {
    return {
      ok: true,
      blocked: false,
      canExecuteFree: true,
      executeNext: builtinFirst,
      task,
      suggestions: [],
      providers: [],
      messageAr: formatFreeExecuteNextAr(builtinFirst),
    }
  }

  if (IS_AIR_GAPPED_MODE) {
    return {
      ok: false,
      blocked: true,
      canExecuteFree: false,
      executeNext: [],
      task,
      suggestions: [],
      providers: [],
      messageAr: [
        'تعذّر تنفيذ المهمة بالأدوات الحالية.',
        'البحث معطّل في الوضع المحلي المغلق — لا أستطيع اقتراح MCP/مهارات من الويب الآن.',
        'إن وفّرت مفتاح/تثبيت أداة مناسبة أقدر أكمّل.',
      ].join('\n'),
    }
  }

  const queries = [
    `${task} free open source MCP OR skill OR tool github`,
    `${task} MCP server MIT OR Apache OR GPL site:github.com`,
    `${task} cursor skill OR agent skill free github`,
    `site:github.com ${task} modelcontextprotocol OR awesome-mcp`,
    `${task} self-host OR no api key free CLI OR mcp`,
  ]

  const providers = new Set<string>()
  const merged: WebSearchHit[] = []
  const seen = new Set<string>()

  const batches = await Promise.all(queries.map((q) => searchOnce(q)))
  for (const batch of batches) {
    for (const p of batch.providers) providers.add(p)
    for (const h of batch.hits) {
      const key = h.url.replace(/\/$/, '').toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      if (!isRelevantHit(h, task)) continue
      merged.push(h)
    }
  }

  const scored = merged
    .map(scoreHit)
    .sort((a, b) => a.costRank - b.costRank || a.title.localeCompare(b.title))
    .slice(0, 5)

  // Map free findings / MCP docs → known free libs (do not run remote code).
  const executeNext = mapSuggestionsToBuiltinFreeTools(task, scored)
  if (executeNext.length) {
    return {
      ok: true,
      blocked: false,
      canExecuteFree: true,
      executeNext,
      task,
      suggestions: scored,
      providers: [...providers],
      messageAr: [
        formatFreeExecuteNextAr(executeNext),
        scored.some((s) => s.costRank <= FREE_RANK_MAX)
          ? 'ملاحظة: وُجدت إشارات GitHub/MCP مجانية — طبّقتها عبر المكتبات المدمجة دون تشغيل كود بعيد.'
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }
  }

  const messageAr = formatBlockedTaskReplyAr({
    suggestions: scored,
    researched: true,
  })

  return {
    ok: scored.length > 0,
    blocked: true,
    canExecuteFree: false,
    executeNext: [],
    task,
    suggestions: scored,
    providers: [...providers],
    messageAr,
  }
}

/**
 * Capability gap: try free execute path first; paid gate only if blocked.
 */
export async function resolveCapabilityGapReplyAr(opts: {
  task: string
  agentText?: string
}): Promise<string> {
  const existing = String(opts.agentText || '').trim()
  if (
    /تعذ[ّر]ر?\s*تنفيذ\s*المهمة|أقترح\s*\(من\s*الأرخص\)|إن\s*وفّرت\s*مفتاح|وُجد مسار مجاني قابل للتنفيذ/i.test(
      existing
    )
  ) {
    if (existing.length >= 40) return existing.slice(0, 3500)
  }

  const researched = await executeResearchTaskTools('research_task_tools', {
    task: opts.task || existing.slice(0, 400),
  })
  return researched.messageAr
}

/** Full research result for bot retry loops (execute free then deliver). */
export async function resolveCapabilityGapResearch(opts: {
  task: string
  agentText?: string
}): Promise<ResearchTaskToolsResult> {
  return executeResearchTaskTools('research_task_tools', {
    task: opts.task || String(opts.agentText || '').slice(0, 400),
  })
}
