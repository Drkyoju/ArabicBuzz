/**
 * When native tools cannot complete a task: search the web + GitHub for
 * skills / MCPs / tools, rank free/low-cost first, and return an MSA Arabic
 * blocked-task reply. Never pretends success.
 */
import { executeWebSearch, type WebSearchHit } from '@/lib/agents/tools/web-tools'
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
  blocked: true
  task: string
  suggestions: ResearchToolSuggestion[]
  providers: string[]
  /** Full MSA reply for Telegram / agent to post verbatim */
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
  // Prefer GitHub / awesome lists / MCP registries slightly within same cost band
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

/** Build the canonical MSA blocked-task reply (user-facing). */
export function formatBlockedTaskReplyAr(opts: {
  suggestions: ResearchToolSuggestion[]
  researched: boolean
}): string {
  const lines: string[] = [
    'تعذّر تنفيذ المهمة بالأدوات الحالية.',
    opts.researched
      ? 'بحثت عن حلول (ويب + GitHub: مهارات / MCP / أدوات)…'
      : 'بحثت عن حلول…',
  ]

  const top = opts.suggestions.slice(0, 3)
  if (top.length === 0) {
    lines.push(
      'أقترح (من الأرخص): ١) مهارة Cursor مجانية من مستودع skills على GitHub ٢) خادم MCP مفتوح المصدر (self-host) ٣) أداة CLI مجانية إن وُجدت للمهمة.'
    )
  } else {
    lines.push('أقترح (من الأرخص):')
    top.forEach((s, i) => {
      const n = ['١', '٢', '٣'][i] || String(i + 1)
      lines.push(
        `${n}) [${kindLabelAr(s.kind)}] ${s.title} — ${s.costLabelAr}\n${s.url}`
      )
    })
  }
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

/**
 * Research free/low-cost skills, MCPs, and tools for a task the agent cannot do.
 */
export async function executeResearchTaskTools(
  _n: string,
  params: Record<string, unknown>
): Promise<ResearchTaskToolsResult> {
  const task = String(
    params.task || params.taskAr || params.query || params.queryAr || ''
  ).trim()
  if (!task) {
    return {
      ok: false,
      blocked: true,
      task: '',
      suggestions: [],
      providers: [],
      messageAr: formatBlockedTaskReplyAr({
        suggestions: [],
        researched: false,
      }),
    }
  }

  if (IS_AIR_GAPPED_MODE) {
    return {
      ok: false,
      blocked: true,
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
    `${task} MCP server free open source`,
    `${task} agent skill OR cursor skill free`,
    `site:github.com MCP OR skill ${task}`,
    `site:github.com ${task} modelcontextprotocol`,
  ]

  const providers = new Set<string>()
  const merged: WebSearchHit[] = []
  const seen = new Set<string>()

  // Parallel free searches (web + GitHub via site: filter)
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

  const messageAr = formatBlockedTaskReplyAr({
    suggestions: scored,
    researched: true,
  })

  return {
    ok: scored.length > 0,
    blocked: true,
    task,
    suggestions: scored,
    providers: [...providers],
    messageAr,
  }
}

/**
 * If the agent already posted the blocked template, keep it.
 * Otherwise run research and return the MSA gap reply.
 */
export async function resolveCapabilityGapReplyAr(opts: {
  task: string
  agentText?: string
}): Promise<string> {
  const existing = String(opts.agentText || '').trim()
  if (
    /تعذ[ّر]ر?\s*تنفيذ\s*المهمة|أقترح\s*\(من\s*الأرخص\)|إن\s*وفّرت\s*مفتاح/i.test(
      existing
    )
  ) {
    // Prefer agent text when it already includes research suggestions
    if (existing.length >= 40) return existing.slice(0, 3500)
  }

  const researched = await executeResearchTaskTools('research_task_tools', {
    task: opts.task || existing.slice(0, 400),
  })
  return researched.messageAr
}
