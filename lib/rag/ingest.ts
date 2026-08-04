import { randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import {
  embedTexts,
  toPgVectorLiteral,
  EMBEDDING_DIMENSIONS,
} from '@/lib/rag/embeddings'
import { prisma, withPrismaFallback } from '@/lib/db'
import { extractDocumentText } from '@/lib/rag/extract'

function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const chunks: string[] = []
  let i = 0
  while (i < clean.length) {
    chunks.push(clean.slice(i, i + size))
    i += size - overlap
  }
  return chunks
}

function fallbackEmbedding(text: string): number[] {
  const vec = new Array(EMBEDDING_DIMENSIONS).fill(0)
  for (let i = 0; i < text.length; i++) {
    const idx = (text.charCodeAt(i) * (i + 7)) % EMBEDDING_DIMENSIONS
    vec[idx] += 1
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return vec.map((v) => v / norm)
}

export async function ingestArabicDocument(opts: {
  scopeId: string
  titleAr: string
  content: string
  sourceFileId?: string
  sourcePath?: string
}): Promise<{ ok: boolean; chunks: number; error?: string }> {
  const raw =
    typeof opts.content === 'string'
      ? opts.content
      : opts.content == null
        ? ''
        : JSON.stringify(opts.content)
  if (!raw.trim() || raw.trim() === '[object Object]') {
    return { ok: false, chunks: 0, error: 'لا يوجد نص صالح للاستيعاب' }
  }
  const chunks = chunkText(raw)
  if (chunks.length === 0) {
    return { ok: false, chunks: 0, error: 'لا يوجد نص للاستيعاب' }
  }

  let embeddings: number[][]
  try {
    embeddings = await embedTexts(chunks, 'search_document')
  } catch {
    embeddings = chunks.map((c) => fallbackEmbedding(c))
  }

  const rows = chunks.map((content, i) => ({
    id: randomUUID(),
    scope_id: opts.scopeId,
    title_ar: `${opts.titleAr} (#${i + 1})`,
    content,
    embedding: toPgVectorLiteral(embeddings[i]!),
    source_file_id: opts.sourceFileId ?? null,
    source_path: opts.sourcePath ?? null,
  }))

  try {
    const inserted = await withPrismaFallback(async () => {
      for (const row of rows) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO knowledge_documents (id, scope_id, title_ar, content, embedding, source_file_id, source_path)
           VALUES ($1::uuid, $2, $3, $4, $5::vector, $6, $7)`,
          row.id,
          row.scope_id,
          row.title_ar,
          row.content,
          row.embedding,
          row.source_file_id,
          row.source_path
        )
      }
      return true
    }, false)

    if (inserted) return { ok: true, chunks: rows.length }

    const sb = getSupabaseAdmin()
    if (!sb) {
      return { ok: false, chunks: 0, error: 'Supabase/Prisma غير مُعدّ' }
    }
    const { error } = await sb.from('knowledge_documents').insert(
      rows.map((r) => ({
        id: r.id,
        scope_id: r.scope_id,
        title_ar: r.title_ar,
        content: r.content,
        embedding: r.embedding,
        source_file_id: r.source_file_id,
        source_path: r.source_path,
      }))
    )
    if (error) return { ok: false, chunks: 0, error: error.message }
    return { ok: true, chunks: rows.length }
  } catch (e) {
    return {
      ok: false,
      chunks: 0,
      error: e instanceof Error ? e.message : 'فشل الاستيعاب',
    }
  }
}

/** Extract text (Word/PPT/PDF/images) with Arabic OCR fallback. */
export async function extractTextFromUpload(
  buffer: Buffer,
  filename: string,
  mime: string
): Promise<string> {
  const result = await extractDocumentText({
    buffer,
    filename,
    mimeType: mime,
    enableOcr: true,
  })
  return result.text
}

export { extractDocumentText }
