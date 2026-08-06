import { prisma, withPrismaFallback } from '@/lib/db'
import {
  embedQuery,
  toPgVectorLiteral,
} from '@/lib/rag/embeddings'
import { COMPANY_BRAIN_SCOPE_ID } from '@/lib/google/drive'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { rerankArabicLexical } from '@/lib/rag/rerank'

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

function resolveSearchScopeId(
  scopeId: string,
  source: KnowledgeSourceFilter
): string {
  if (source === 'drive') return COMPANY_BRAIN_SCOPE_ID
  return scopeId || COMPANY_BRAIN_SCOPE_ID
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
        ORDER BY GREATEST(
          ts_rank_cd(tsv_content, to_tsquery('arabic', $1)),
          ts_rank_cd(to_tsvector('arabic', coalesce(title_ar, '')), to_tsquery('arabic', $1))
        ) DESC
      )::int AS rank
    FROM knowledge_documents
    WHERE scope_id::text = $2
      AND (
        tsv_content @@ to_tsquery('arabic', $1)
        OR to_tsvector('arabic', coalesce(title_ar, '')) @@ to_tsquery('arabic', $1)
      )
      ${sourceClause(source)}
    ORDER BY GREATEST(
      ts_rank_cd(tsv_content, to_tsquery('arabic', $1)),
      ts_rank_cd(to_tsvector('arabic', coalesce(title_ar, '')), to_tsquery('arabic', $1))
    ) DESC
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
/** Lexical fallback when Prisma/pgvector is unreachable from Netlify. */
async function supabaseLexicalFallback(
  queryText: string,
  scopeId: string,
  limit: number,
  source: KnowledgeSourceFilter
): Promise<RAGDocument[]> {
  const sb = getSupabaseAdmin()
  if (!sb) return []
  const tokens = queryText
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 6)
  if (tokens.length === 0) return []

  let q = sb
    .from('knowledge_documents')
    .select('id, scope_id, title_ar, content, source_file_id, source_path')
    .eq('scope_id', scopeId)
    .limit(Math.max(limit * 8, 40))

  if (source === 'drive') {
    q = q.like('source_file_id', `${DRIVE_SOURCE_PREFIX}%`)
  }

  // Prefer title hits: or(ilike title, ilike content) for each strong token
  const orParts = tokens.flatMap((t) => [
    `title_ar.ilike.%${t}%`,
    `content.ilike.%${t}%`,
  ])
  q = q.or(orParts.join(','))

  const { data, error } = await q
  if (error || !data?.length) return []

  const scored = data
    .map((row, i) => {
      const title = String(row.title_ar || '')
      const content = String(row.content || '')
      let score = 0
      for (const t of tokens) {
        if (title.includes(t)) score += 3
        if (content.includes(t)) score += 1
      }
      return {
        id: String(row.id),
        scopeId: String(row.scope_id),
        titleAr: title,
        content,
        rrfScore: score || 1 / (60 + i + 1),
        rankBm25: i + 1,
        rankVector: null as number | null,
        metadata: {
          bm25Rank: i + 1,
          vectorRank: null as number | null,
          source: 'supabase_lexical' as const,
          sourceFileId: (row.source_file_id as string | null) ?? null,
          sourcePath: (row.source_path as string | null) ?? null,
        },
      }
    })
    .filter((d) => d.rrfScore > 0)
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)

  return scored
}

export async function hybridArabicSearch(
  queryText: string,
  scopeId: string,
  limit = 5,
  opts?: { source?: KnowledgeSourceFilter }
): Promise<RAGDocument[]> {
  const trimmed = queryText?.trim()
  if (!trimmed) return []
  const source: KnowledgeSourceFilter = opts?.source ?? 'drive'
  const searchScopeId = resolveSearchScopeId(scopeId, source)

  const viaPrisma = await withPrismaFallback(async () => {
    const tsQuery = buildArabicTsQuery(trimmed)
    const fetchLimit = Math.max(limit * 4, 20)

    let bm25Hits: RankedHit[] = []
    let vectorHits: RankedHit[] = []

    bm25Hits = await lexicalBm25Search(
      tsQuery,
      searchScopeId,
      fetchLimit,
      source
    ).catch(() => [] as RankedHit[])

    try {
      const queryEmbedding = await embedQuery(trimmed)
      const embeddingLiteral = toPgVectorLiteral(queryEmbedding)
      vectorHits = await vectorSimilaritySearch(
        embeddingLiteral,
        searchScopeId,
        fetchLimit,
        source
      ).catch(() => [] as RankedHit[])
    } catch {
      // Embeddings unavailable (no Cohere key) — BM25-only is fine
      vectorHits = []
    }

    if (bm25Hits.length === 0 && vectorHits.length === 0) return []

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
  }, [] as RAGDocument[])

  const base =
    viaPrisma.length > 0
      ? viaPrisma
      : await supabaseLexicalFallback(trimmed, searchScopeId, Math.max(limit * 3, 12), source)

  return rerankArabicLexical(trimmed, base, limit)
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
