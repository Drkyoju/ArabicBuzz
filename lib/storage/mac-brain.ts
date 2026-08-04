import { randomUUID } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { getLocalStorageRoot, getStorageStatus } from '@/lib/storage/local'

export type MacBrainChunk = {
  id: string
  scopeId: string
  titleAr: string
  content: string
  sourceFileId?: string | null
  sourcePath?: string | null
  createdAt: string
}

function brainDir() {
  return path.join(getLocalStorageRoot(), 'brain')
}

function scopeChunksPath(scopeId: string) {
  const safe = scopeId.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF.]/g, '_').slice(0, 120)
  return path.join(brainDir(), `${safe}.jsonl`)
}

export function ensureMacBrain() {
  const dir = brainDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

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

export function ingestMacBrainDocument(opts: {
  scopeId: string
  titleAr: string
  content: string
  sourceFileId?: string | null
  sourcePath?: string | null
}): { ok: true; chunks: number } | { ok: false; error: string } {
  ensureMacBrain()
  const parts = chunkText(opts.content)
  if (parts.length === 0) {
    return { ok: false, error: 'لا يوجد نص للاستيعاب' }
  }
  const file = scopeChunksPath(opts.scopeId)
  const now = new Date().toISOString()
  for (let i = 0; i < parts.length; i++) {
    const row: MacBrainChunk = {
      id: randomUUID(),
      scopeId: opts.scopeId,
      titleAr: `${opts.titleAr} (#${i + 1})`,
      content: parts[i]!,
      sourceFileId: opts.sourceFileId ?? null,
      sourcePath: opts.sourcePath ?? null,
      createdAt: now,
    }
    appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8')
  }
  return { ok: true, chunks: parts.length }
}

export function listMacBrainChunks(scopeId?: string): MacBrainChunk[] {
  ensureMacBrain()
  const dir = brainDir()
  const files = scopeId
    ? [scopeChunksPath(scopeId)]
    : readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => path.join(dir, f))

  const out: MacBrainChunk[] = []
  for (const file of files) {
    if (!existsSync(file)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        out.push(JSON.parse(line) as MacBrainChunk)
      } catch {
        /* skip */
      }
    }
  }
  return out
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

/** Simple keyword scoring for local Mac brain (no cloud DB). */
export function searchMacBrain(opts: {
  queryAr: string
  scopeId: string
  limit?: number
  /** Drive-only = gdrive: prefix (default for Gemini). */
  source?: 'drive' | 'all'
}): Array<{
  id: string
  titleAr: string
  content: string
  rrfScore: number
  rankBm25: number | null
  rankVector: number | null
  metadata: { source: 'mac-brain'; sourceFileId?: string | null; sourcePath?: string | null }
}> {
  const limit = opts.limit ?? 5
  const tokens = tokenize(opts.queryAr)
  let chunks = listMacBrainChunks(opts.scopeId)
  if ((opts.source ?? 'drive') === 'drive') {
    chunks = chunks.filter((c) =>
      Boolean(c.sourceFileId && c.sourceFileId.startsWith('gdrive:'))
    )
  }
  if (chunks.length === 0 || tokens.length === 0) return []

  const scored = chunks.map((c) => {
    const hay = `${c.titleAr} ${c.content}`.toLowerCase()
    let score = 0
    for (const t of tokens) {
      if (hay.includes(t)) score += 1 + (hay.split(t).length - 1) * 0.15
    }
    if (hay.includes(opts.queryAr.trim().toLowerCase())) score += 2
    return { c, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s, i) => ({
      id: s.c.id,
      titleAr: s.c.titleAr,
      content: s.c.content,
      rrfScore: s.score / (60 + i + 1),
      rankBm25: i + 1,
      rankVector: null,
      metadata: {
        source: 'mac-brain' as const,
        sourceFileId: s.c.sourceFileId,
        sourcePath: s.c.sourcePath,
      },
    }))
}

export function getMacBrainStatus() {
  ensureMacBrain()
  const storage = getStorageStatus()
  const chunks = listMacBrainChunks()
  const byScope: Record<string, number> = {}
  for (const c of chunks) {
    byScope[c.scopeId] = (byScope[c.scopeId] || 0) + 1
  }
  let brainBytes = 0
  const dir = brainDir()
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      try {
        brainBytes += statSync(path.join(dir, name)).size
      } catch {
        /* ignore */
      }
    }
  }
  return {
    ok: true,
    primary: 'mac' as const,
    vaultRoot: storage.root,
    vaultBytes: storage.bytes,
    vaultFiles: storage.fileCount,
    chunkCount: chunks.length,
    chunksByScope: byScope,
    brainBytes,
    messageAr:
      'عقل الشركة على هذا الماك — الملفات والمقاطع تُحفظ محلياً. السحابة تبحث عبر النفق فقط.',
  }
}

/** Wipe scope brain file (admin/debug). */
export function clearMacBrainScope(scopeId: string) {
  ensureMacBrain()
  const file = scopeChunksPath(scopeId)
  if (existsSync(file)) writeFileSync(file, '', 'utf8')
}
