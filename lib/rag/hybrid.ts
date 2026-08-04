import { prisma, withPrismaFallback } from '@/lib/db'
import {
  embedQuery,
  toPgVectorLiteral,
} from '@/lib/rag/embeddings'

export type RAGDocument = {
  id: string
  scopeId: string
  titleAr: string
  content: string
  rrfScore: number
  rankBm25: number | null
  rankVector: number | null
  metadata: {
    bm25Rank: number | null
    vectorRank: number | null
    source: 'hybrid_rrf' | 'mac-brain' | string
    sourceFileId?: string | null
    sourcePath?: string | null
  }
}

/** Restrict Gemini / RAG to Google Drive uploads only (`gdrive:{fileId}`). */
export type KnowledgeSourceFilter = 'drive' | 'all'

export const DRIVE_SOURCE_PREFIX = 'gdrive:'

type RankedHit = {
  id: string
  scope_id: string
  title_ar: string
  content: string
  rank: number
  source_file_id: string | null
  source_path: string | null
}

const RRF_K = 60

/**
 * Build a safe `to_tsquery('arabic', ...)` string from free-form Arabic text.
 * Joins tokens with AND so BM25 lexical search matches the requested API.
 */
export function buildArabicTsQuery(queryText: string): string {
  const tokens = queryText
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/[':\\!()|&*<>]/g, ''))
    .filter(Boolean)

  if (tokens.length === 0) return 'عربي'
  return tokens.join(' & ')
}

function rrfFuse(rankVector: number | null, rankBm25: number | null): number {
  let score = 0
  if (rankVector != null) score += 1 / (RRF_K + rankVector)
  if (rankBm25 != null) score += 1 / (RRF_K + rankBm25)
  return score
}

function sourceClause(source: KnowledgeSourceFilter): string {
  if (source === 'drive') {
    return `AND source_file_id IS NOT NULL AND source_file_id LIKE '${DRIVE_SOURCE_PREFIX}%'`
  }
  return ''
}

async function lexicalBm25Search(
  tsQuery: string,
  scopeId: string,
  fetchLimit: number,
  source: KnowledgeSourceFilter
): Promise<RankedHit[]> {
  return prisma.$queryRawUnsafe<RankedHit[]>(
    `
    SELECT
      id::text AS id,
      scope_id::text AS scope_id,
      title_ar,
      content,
      source_file_id,
      source_path,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(tsv_content, to_tsquery('arabic', $1)) DESC
      )::int AS rank
    FROM knowledge_documents
    WHERE scope_id::text = $2
      AND tsv_content @@ to_tsquery('arabic', $1)
      ${sourceClause(source)}
    ORDER BY ts_rank_cd(tsv_content, to_tsquery('arabic', $1)) DESC
    LIMIT $3
    `,
    tsQuery,
    scopeId,
    fetchLimit
  )
}

async function vectorSimilaritySearch(
  embeddingLiteral: string,
  scopeId: string,
  fetchLimit: number,
  source: KnowledgeSourceFilter
): Promise<RankedHit[]> {
  return prisma.$queryRawUnsafe<RankedHit[]>(
    `
    SELECT
      id::text AS id,
      scope_id::text AS scope_id,
      title_ar,
      content,
      source_file_id,
      source_path,
      ROW_NUMBER() OVER (
        ORDER BY embedding <=> $1::vector
      )::int AS rank
    FROM knowledge_documents
    WHERE scope_id::text = $2
      ${sourceClause(source)}
    ORDER BY embedding <=> $1::vector
    LIMIT $3
    `,
    embeddingLiteral,
    scopeId,
    fetchLimit
  )
}

/**
 * Hybrid Arabic RAG retrieval:
 * 1) Lexical BM25 via `to_tsquery('arabic', …)`
 * 2) Vector cosine distance (`<=>`) on 1024-d embeddings
 * 3) Reciprocal Rank Fusion: `1/(60+rank_vector) + 1/(60+rank_bm25)`
 *
 * Default source filter is Drive-only so Gemini trains/answers only from
 * files synced from the user's Google Drive folder.
 */
export async function hybridArabicSearch(
  queryText: string,
  scopeId: string,
  limit = 5,
  opts?: { source?: KnowledgeSourceFilter }
): Promise<RAGDocument[]> {
  const trimmed = queryText?.trim()
  if (!trimmed) return []
  const source: KnowledgeSourceFilter = opts?.source ?? 'drive'

  return withPrismaFallback(async () => {
    const tsQuery = buildArabicTsQuery(trimmed)
    const fetchLimit = Math.max(limit * 4, 20)

    const queryEmbedding = await embedQuery(trimmed)
    const embeddingLiteral = toPgVectorLiteral(queryEmbedding)

    const [bm25Hits, vectorHits] = await Promise.all([
      lexicalBm25Search(tsQuery, scopeId, fetchLimit, source).catch(
        () => [] as RankedHit[]
      ),
      vectorSimilaritySearch(
        embeddingLiteral,
        scopeId,
        fetchLimit,
        source
      ).catch(() => [] as RankedHit[]),
    ])

    const byId = new Map<
      string,
      {
        id: string
        scopeId: string
        titleAr: string
        content: string
        rankBm25: number | null
        rankVector: number | null
        sourceFileId: string | null
        sourcePath: string | null
      }
    >()

    for (const hit of bm25Hits) {
      byId.set(hit.id, {
        id: hit.id,
        scopeId: hit.scope_id,
        titleAr: hit.title_ar,
        content: hit.content,
        rankBm25: Number(hit.rank),
        rankVector: null,
        sourceFileId: hit.source_file_id,
        sourcePath: hit.source_path,
      })
    }

    for (const hit of vectorHits) {
      const existing = byId.get(hit.id)
      if (existing) {
        existing.rankVector = Number(hit.rank)
        if (!existing.sourceFileId) existing.sourceFileId = hit.source_file_id
        if (!existing.sourcePath) existing.sourcePath = hit.source_path
      } else {
        byId.set(hit.id, {
          id: hit.id,
          scopeId: hit.scope_id,
          titleAr: hit.title_ar,
          content: hit.content,
          rankBm25: null,
          rankVector: Number(hit.rank),
          sourceFileId: hit.source_file_id,
          sourcePath: hit.source_path,
        })
      }
    }

    return [...byId.values()]
      .map((doc) => {
        const score = rrfFuse(doc.rankVector, doc.rankBm25)
        return {
          id: doc.id,
          scopeId: doc.scopeId,
          titleAr: doc.titleAr,
          content: doc.content,
          rrfScore: score,
          rankBm25: doc.rankBm25,
          rankVector: doc.rankVector,
          metadata: {
            bm25Rank: doc.rankBm25,
            vectorRank: doc.rankVector,
            source: 'hybrid_rrf' as const,
            sourceFileId: doc.sourceFileId,
            sourcePath: doc.sourcePath,
          },
        }
      })
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit)
  }, [])
}

/** Insert / update a knowledge chunk (embeds content with the active provider). */
export async function upsertKnowledgeDocument(input: {
  id?: string
  scopeId: string
  titleAr: string
  content: string
  embedding?: number[]
}): Promise<{ id: string }> {
  const { embedDocument } = await import('@/lib/rag/embeddings')
  const embedding = input.embedding || (await embedDocument(input.content))
  const literal = toPgVectorLiteral(embedding)
  const id = input.id || crypto.randomUUID()

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO knowledge_documents (id, scope_id, title_ar, content, embedding)
    VALUES ($1::uuid, $2, $3, $4, $5::vector)
    ON CONFLICT (id) DO UPDATE SET
      title_ar = EXCLUDED.title_ar,
      content = EXCLUDED.content,
      embedding = EXCLUDED.embedding,
      updated_at = now()
    `,
    id,
    input.scopeId,
    input.titleAr,
    input.content,
    literal
  )

  return { id }
}
