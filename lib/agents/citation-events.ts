import type { RoomCitation } from '@/lib/scopes/types'

type DocLike = {
  citation?: string
  titleAr?: string
  excerpt?: string
  url?: string
  metadata?: { url?: string; sourceUrl?: string }
}

/** Pull RAG citation chips from a tool output object (any nesting). */
export function extractCitationsFromToolOutput(
  toolOut: unknown
): RoomCitation[] {
  if (!toolOut || typeof toolOut !== 'object') return []
  const out = toolOut as Record<string, unknown>
  const nested =
    out.output && typeof out.output === 'object'
      ? (out.output as Record<string, unknown>)
      : out
  const docs = (nested.documents || out.documents) as DocLike[] | undefined
  if (!Array.isArray(docs)) return []
  const citations: RoomCitation[] = []
  for (const d of docs) {
    const label =
      d.citation || (d.titleAr ? `[مصدر: ${d.titleAr}]` : '') || ''
    const url = d.url || d.metadata?.url || d.metadata?.sourceUrl || undefined
    if (label && !citations.some((c) => c.labelAr === label)) {
      citations.push({ labelAr: label, excerpt: d.excerpt, url })
    }
  }
  return citations
}

export function extractPausedApprovalId(toolOut: unknown): string | null {
  if (!toolOut || typeof toolOut !== 'object') return null
  const out = toolOut as Record<string, unknown>
  const nested =
    out.output && typeof out.output === 'object'
      ? (out.output as Record<string, unknown>)
      : out
  if (nested.status === 'paused' && typeof nested.approvalId === 'string') {
    return nested.approvalId
  }
  return null
}

/** Walk generateText / streamText step tool results. */
export function extractFromAgentSteps(steps: unknown): {
  citations: RoomCitation[]
  pendingApprovalIds: string[]
} {
  const citations: RoomCitation[] = []
  const pendingApprovalIds: string[] = []
  if (!Array.isArray(steps)) return { citations, pendingApprovalIds }

  for (const step of steps) {
    if (!step || typeof step !== 'object') continue
    const s = step as Record<string, unknown>
    const toolResults = (s.toolResults || s.content) as unknown
    const list = Array.isArray(toolResults) ? toolResults : []
    for (const tr of list) {
      if (!tr || typeof tr !== 'object') continue
      const row = tr as Record<string, unknown>
      const out = row.output ?? row.result ?? row
      for (const c of extractCitationsFromToolOutput(out)) {
        if (!citations.some((x) => x.labelAr === c.labelAr)) citations.push(c)
      }
      const aid = extractPausedApprovalId(out)
      if (aid && !pendingApprovalIds.includes(aid)) pendingApprovalIds.push(aid)
    }
  }
  return { citations, pendingApprovalIds }
}

/** Format citations as Telegram / plain-text footer. */
export function formatCitationsFooterAr(citations: RoomCitation[]): string {
  if (!citations.length) return ''
  const lines = citations.map((c, i) => {
    const base = `${i + 1}. ${c.labelAr}`
    if (c.url) return `${base}\n   ${c.url}`
    if (c.excerpt) return `${base}\n   ${c.excerpt.slice(0, 160)}`
    return base
  })
  return `\n\n📚 المصادر:\n${lines.join('\n')}`
}
