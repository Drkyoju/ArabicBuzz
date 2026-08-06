import type { RAGDocument } from '@/lib/rag/hybrid'
import { expandArabicQueryTokens } from '@/lib/rag/arabic-synonyms'

/**
 * Free local Arabic-aware re-rank (no API).
 * Boosts title hits and query-token overlap — good enough when Cohere Rerank
 * is not configured. Optional: COHERE_API_KEY + COHERE_RERANK=1 for paid path later.
 */
export function rerankArabicLexical(
  queryAr: string,
  docs: RAGDocument[],
  limit: number
): RAGDocument[] {
  const tokens = expandArabicQueryTokens(queryAr).filter((t) => t.length >= 2)

  if (tokens.length === 0 || docs.length === 0) {
    return docs.slice(0, limit)
  }

  return [...docs]
    .map((doc) => {
      const title = doc.titleAr || ''
      const content = doc.content || ''
      let boost = 0
      for (const t of tokens) {
        if (title.includes(t)) boost += 2.5
        if (content.includes(t)) boost += 0.35
      }
      // Prefer Drive-sourced chunks slightly
      if (doc.metadata?.sourceFileId?.startsWith('gdrive:')) boost += 0.2
      return {
        ...doc,
        rrfScore: (doc.rrfScore || 0) + boost,
      }
    })
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
}
