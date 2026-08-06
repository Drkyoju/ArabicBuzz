import { CohereClient } from 'cohere-ai'

export const EMBEDDING_DIMENSIONS = 1024

export type EmbeddingProvider = 'cohere' | 'bge-m3' | 'hf-e5' | 'hash'

export type EmbedInputType = 'search_query' | 'search_document'

/**
 * Free-first cascade (no paid subscription required):
 * 1) EMBEDDING_PROVIDER override (explicit)
 * 2) Hugging Face e5 if HF_TOKEN (free account token)
 * 3) BGE-M3 if BGE_M3_BASE_URL (self-host from GitHub FlagEmbedding)
 * 4) Cohere only if EMBEDDING_PROVIDER=cohere (opt-in paid)
 * 5) Hash fallback (always free)
 */
function resolveProvider(): EmbeddingProvider {
  const raw = (process.env.EMBEDDING_PROVIDER || '').toLowerCase().trim()
  if (raw === 'hash' || raw === 'fallback') return 'hash'
  if (raw === 'bge-m3' || raw === 'bge') return 'bge-m3'
  if (raw === 'hf' || raw === 'hf-e5' || raw === 'e5') return 'hf-e5'
  if (raw === 'cohere') return 'cohere'

  // Default: never auto-pick paid Cohere
  if (process.env.HF_TOKEN?.trim()) return 'hf-e5'
  if (process.env.BGE_M3_BASE_URL?.trim()) return 'bge-m3'
  return 'hash'
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

function normalizeDims(row: number[]): number[] {
  if (row.length === EMBEDDING_DIMENSIONS) return row
  if (row.length > EMBEDDING_DIMENSIONS) {
    return row.slice(0, EMBEDDING_DIMENSIONS)
  }
  // pad short vectors (some HF models return mean-pooled variable shapes)
  return [...row, ...new Array(EMBEDDING_DIMENSIONS - row.length).fill(0)]
}

/** Local free fallback — same dim as production vectors. */
export function hashEmbedding(text: string): number[] {
  const vec = new Array(EMBEDDING_DIMENSIONS).fill(0)
  for (let i = 0; i < text.length; i++) {
    const idx = (text.charCodeAt(i) * (i + 7)) % EMBEDDING_DIMENSIONS
    vec[idx] += 1
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return vec.map((v) => v / norm)
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

  return floats.map(normalizeDims)
}

/**
 * BGE-M3 via OpenAI-compatible embeddings endpoint
 * (Ollama, TEI, Infinity, HuggingFace routers, FlagEmbedding server).
 * Free when self-hosted: https://github.com/FlagOpen/FlagEmbedding
 */
async function embedWithBgeM3(texts: string[]): Promise<number[][]> {
  const base = process.env.BGE_M3_BASE_URL || process.env.OLLAMA_BASE_URL || ''
  if (!base) {
    throw new Error(
      'BGE-M3 غير مُعدّ. اضبط BGE_M3_BASE_URL أو استخدم HF_TOKEN للمسار المجاني.'
    )
  }
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

  return rows.map(normalizeDims)
}

/**
 * Free Hugging Face Inference — multilingual-e5-large (1024-d, strong Arabic).
 * Model: https://huggingface.co/intfloat/multilingual-e5-large
 * Needs HF_TOKEN (free account). E5 requires query:/passage: prefixes.
 */
async function embedWithHfE5(
  texts: string[],
  inputType: EmbedInputType
): Promise<number[][]> {
  const token = process.env.HF_TOKEN?.trim()
  if (!token) throw new Error('HF_TOKEN required for hf-e5 embeddings')

  const model =
    process.env.HF_EMBED_MODEL || 'intfloat/multilingual-e5-large'
  const prefix = inputType === 'search_query' ? 'query: ' : 'passage: '
  const prefixed = texts.map((t) => `${prefix}${t}`)

  const endpoints = [
    `https://router.huggingface.co/hf-inference/models/${model}/pipeline/feature-extraction`,
    `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`,
    `https://api-inference.huggingface.co/models/${model}`,
  ]

  let lastErr = 'HF embed failed'
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: prefixed, options: { wait_for_model: true } }),
      })
      if (!res.ok) {
        lastErr = `HF embed ${res.status}: ${(await res.text()).slice(0, 160)}`
        continue
      }
      const json = (await res.json()) as unknown
      const rows = coerceHfEmbeddings(json, texts.length)
      if (rows) return rows.map(normalizeDims)
      lastErr = 'HF embed unexpected shape'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'HF embed network error'
    }
  }
  throw new Error(lastErr)
}

function coerceHfEmbeddings(
  json: unknown,
  expected: number
): number[][] | null {
  // [[dim…], [dim…]] or [[[tok, dim]…], …] mean-pool tokens
  if (!Array.isArray(json) || json.length === 0) return null

  const first = json[0]
  if (typeof first === 'number') {
    // single vector for one input
    if (expected !== 1) return null
    return [json as number[]]
  }

  if (!Array.isArray(first)) return null

  if (typeof first[0] === 'number') {
    // batch of vectors
    if (json.length !== expected) return null
    return json as number[][]
  }

  if (Array.isArray(first[0])) {
    // token-level → mean pool each sequence
    const pooled = (json as number[][][]).map((tokens) => {
      const dims = tokens[0]?.length || 0
      const acc = new Array(dims).fill(0)
      for (const tok of tokens) {
        for (let i = 0; i < dims; i++) acc[i] += tok[i] || 0
      }
      const n = tokens.length || 1
      return acc.map((v) => v / n)
    })
    if (pooled.length !== expected) return null
    return pooled
  }

  return null
}

export async function embedTexts(
  texts: string[],
  inputType: EmbedInputType = 'search_document'
): Promise<number[][]> {
  if (texts.length === 0) return []
  const provider = resolveProvider()

  try {
    if (provider === 'hash') {
      return texts.map(hashEmbedding)
    }
    if (provider === 'bge-m3') {
      return await embedWithBgeM3(texts)
    }
    if (provider === 'hf-e5') {
      return await embedWithHfE5(texts, inputType)
    }
    return await embedWithCohere(texts, inputType)
  } catch (e) {
    // Cascade down to free options so ingest/search never hard-fail
    if (provider !== 'hf-e5' && process.env.HF_TOKEN?.trim()) {
      try {
        return await embedWithHfE5(texts, inputType)
      } catch {
        /* fall through */
      }
    }
    if (provider !== 'bge-m3' && process.env.BGE_M3_BASE_URL?.trim()) {
      try {
        return await embedWithBgeM3(texts)
      } catch {
        /* fall through */
      }
    }
    console.warn(
      '[embeddings] falling back to hash vectors:',
      e instanceof Error ? e.message : e
    )
    return texts.map(hashEmbedding)
  }
}

export async function embedQuery(queryText: string): Promise<number[]> {
  const [vec] = await embedTexts([queryText], 'search_query')
  return vec
}

export async function embedDocument(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text], 'search_document')
  return vec
}

export function getActiveEmbeddingProvider(): EmbeddingProvider {
  return resolveProvider()
}
