import { tool } from 'ai'
import { z } from 'zod'
import {
  hybridArabicSearch,
  type RAGDocument,
} from '@/lib/rag/hybrid'
import {
  isBrainPrimaryMac,
  macBrainSearch,
} from '@/lib/storage/mac-sync-client'

export type SearchKnowledgeBaseResult = {
  queryAr: string
  scopeId: string
  count: number
  citationBlockAr: string
  documents: Array<{
    citation: string
    id: string
    titleAr: string
    excerpt: string
    rrfScore: number
    metadata: RAGDocument['metadata']
    url?: string
  }>
}

function excerpt(text: string, max = 420): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/** Format hybrid RAG hits as Arabic citation blocks for the agent. */
export function formatArabicCitations(
  docs: RAGDocument[],
  queryAr: string
): { documents: SearchKnowledgeBaseResult['documents']; block: string } {
  const documents = docs.map((doc, i) => {
    const n = i + 1
    const meta = (doc.metadata || {}) as Record<string, unknown>
    const urlCandidate = [meta.url, meta.sourceUrl, meta.webViewLink, meta.sourcePath]
      .find((v) => typeof v === 'string' && String(v).startsWith('http'))
    const url = typeof urlCandidate === 'string' ? urlCandidate : undefined
    return {
      citation: `[مصدر ${n}: ${doc.titleAr}]`,
      id: doc.id,
      titleAr: doc.titleAr,
      excerpt: excerpt(doc.content),
      rrfScore: doc.rrfScore,
      metadata: doc.metadata,
      url,
    }
  })

  if (documents.length === 0) {
    return {
      documents,
      block: `لم يُعثر على مستندات مطابقة لـ «${queryAr}» في قاعدة المعرفة.`,
    }
  }

  const block = [
    `نتائج البحث الهجين عن: «${queryAr}»`,
    ...documents.map((d, i) => {
      const src = docs[i]
      return `${d.citation}\n${d.excerpt}\n(درجة RRF: ${d.rrfScore.toFixed(4)} | BM25#${src.rankBm25 ?? '—'} | متجه#${src.rankVector ?? '—'})`
    }),
  ].join('\n\n')

  return { documents, block }
}

export async function searchKnowledgeBase(opts: {
  queryAr: string
  scopeId: string
  limit?: number
}): Promise<SearchKnowledgeBaseResult> {
  if (isBrainPrimaryMac()) {
    try {
      const hits = await macBrainSearch({
        queryAr: opts.queryAr,
        scopeId: opts.scopeId,
        limit: opts.limit ?? 5,
      })
      const docs: RAGDocument[] = hits.map((h) => ({
        id: h.id,
        scopeId: opts.scopeId,
        titleAr: h.titleAr,
        content: h.content,
        rrfScore: h.rrfScore,
        rankBm25: h.rankBm25,
        rankVector: h.rankVector,
        metadata: {
          bm25Rank: h.rankBm25,
          vectorRank: h.rankVector,
          source: 'mac-brain',
          sourceFileId:
            typeof h.metadata?.sourceFileId === 'string'
              ? h.metadata.sourceFileId
              : null,
          sourcePath:
            typeof h.metadata?.sourcePath === 'string'
              ? h.metadata.sourcePath
              : null,
        },
      }))
      const formatted = formatArabicCitations(docs, opts.queryAr)
      return {
        queryAr: opts.queryAr,
        scopeId: opts.scopeId,
        count: docs.length,
        citationBlockAr: formatted.block,
        documents: formatted.documents,
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'تعذّر البحث في عقل الماك'
      return {
        queryAr: opts.queryAr,
        scopeId: opts.scopeId,
        count: 0,
        citationBlockAr: `عقل الشركة على الماك غير متاح حالياً: ${msg}`,
        documents: [],
      }
    }
  }

  const docs = await hybridArabicSearch(
    opts.queryAr,
    opts.scopeId,
    opts.limit ?? 5
  )
  const formatted = formatArabicCitations(docs, opts.queryAr)

  return {
    queryAr: opts.queryAr,
    scopeId: opts.scopeId,
    count: docs.length,
    citationBlockAr: formatted.block,
    documents: formatted.documents,
  }
}

/**
 * Vercel AI SDK tool: `search_knowledge_base`
 * Accepts `{ queryAr }`, runs hybrid BM25 + vector + RRF retrieval.
 */
export function createSearchKnowledgeBaseTool(scopeId: string) {
  return tool({
    description:
      'بحث هجين (BM25 عربي + متجهات + RRF) في قاعدة المعرفة للنطاق الحالي. استخدمه عند الحاجة لمراجع أو سياسات أو مستندات داخلية.',
    inputSchema: z.object({
      queryAr: z.string().min(1).describe('استعلام البحث بالعربية'),
    }),
    execute: async ({ queryAr }) => {
      const result = await searchKnowledgeBase({ queryAr, scopeId })
      return {
        citationBlockAr: result.citationBlockAr,
        count: result.count,
        documents: result.documents,
      }
    },
  })
}

/** Registry-compatible executor for interceptToolExecution. */
export async function executeSearchKnowledgeBase(
  _toolName: string,
  params: Record<string, unknown>
): Promise<SearchKnowledgeBaseResult> {
  const queryAr = String(params.queryAr || params.query || '')
  const scopeId = String(
    params.scopeId || '00000000-0000-0000-0000-000000000001'
  )
  const limit = typeof params.limit === 'number' ? params.limit : undefined
  return searchKnowledgeBase({ queryAr, scopeId, limit })
}
