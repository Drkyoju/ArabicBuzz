import { CohereClient } from 'cohere-ai'

export const EMBEDDING_DIMENSIONS = 1024

export type EmbeddingProvider = 'cohere' | 'bge-m3'

export type EmbedInputType = 'search_query' | 'search_document'

function resolveProvider(): EmbeddingProvider {
  const raw = (process.env.EMBEDDING_PROVIDER || 'cohere').toLowerCase()
  return raw === 'bge-m3' || raw === 'bge' ? 'bge-m3' : 'cohere'
}

/** Format float array as pgvector literal: [0.1,0.2,...] */
export function toPgVectorLiteral(values: number[]): string {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS}-dim embedding, got ${values.length}`
    )
  }
  return `[${values.join(',')}]`
}

async function embedWithCohere(
  texts: string[],
  inputType: EmbedInputType
): Promise<number[][]> {
  const token = process.env.COHERE_API_KEY
  if (!token) {
    throw new Error('COHERE_API_KEY is required for Cohere embeddings')
  }

  const client = new CohereClient({ token })
  const model =
    process.env.COHERE_EMBED_MODEL || 'embed-multilingual-v3.0'

  const response = await client.embed({
    texts,
    model,
    inputType,
  })

  let floats: number[][]
  if (
    response &&
    typeof response === 'object' &&
    'responseType' in response &&
    response.responseType === 'embeddings_by_type'
  ) {
    const byType = response.embeddings as { float?: number[][] }
    floats = byType.float || []
  } else if (
    response &&
    typeof response === 'object' &&
    'embeddings' in response &&
    Array.isArray(response.embeddings)
  ) {
    floats = response.embeddings as number[][]
  } else {
    throw new Error('Cohere embed returned unexpected payload')
  }

  if (floats.length !== texts.length) {
    throw new Error('Cohere embed returned unexpected payload')
  }

  return floats.map((row: number[]) => {
    if (row.length !== EMBEDDING_DIMENSIONS) {
      if (row.length > EMBEDDING_DIMENSIONS) {
        return row.slice(0, EMBEDDING_DIMENSIONS)
      }
      throw new Error(
        `Cohere embedding dim ${row.length} != ${EMBEDDING_DIMENSIONS}`
      )
    }
    return row
  })
}

/**
 * BGE-M3 via OpenAI-compatible embeddings endpoint
 * (Ollama, TEI, Infinity, HuggingFace routers, etc.)
 */
async function embedWithBgeM3(texts: string[]): Promise<number[][]> {
  const base =
    process.env.BGE_M3_BASE_URL ||
    process.env.OLLAMA_BASE_URL ||
    'http://localhost:11434/v1'
  const model = process.env.BGE_M3_MODEL || 'bge-m3'
  const apiKey = process.env.BGE_M3_API_KEY || process.env.OPENAI_API_KEY || ''

  const res = await fetch(`${base.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, input: texts }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`BGE-M3 embed failed (${res.status}): ${body.slice(0, 200)}`)
  }

  const json = (await res.json()) as {
    data?: Array<{ embedding: number[]; index: number }>
  }
  const rows = (json.data || [])
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding)

  if (rows.length !== texts.length) {
    throw new Error('BGE-M3 embed returned unexpected payload')
  }

  return rows.map((row) => {
    if (row.length === EMBEDDING_DIMENSIONS) return row
    if (row.length > EMBEDDING_DIMENSIONS) {
      return row.slice(0, EMBEDDING_DIMENSIONS)
    }
    throw new Error(
      `BGE-M3 embedding dim ${row.length} != ${EMBEDDING_DIMENSIONS}`
    )
  })
}

export async function embedTexts(
  texts: string[],
  inputType: EmbedInputType = 'search_document'
): Promise<number[][]> {
  if (texts.length === 0) return []
  const provider = resolveProvider()
  if (provider === 'bge-m3') {
    return embedWithBgeM3(texts)
  }
  return embedWithCohere(texts, inputType)
}

export async function embedQuery(queryText: string): Promise<number[]> {
  const [vec] = await embedTexts([queryText], 'search_query')
  return vec
}

export async function embedDocument(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text], 'search_document')
  return vec
}
