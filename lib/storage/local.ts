import { createHash, randomUUID } from 'node:crypto'
import {
  mkdirSync,
  existsSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export type StoredKind =
  | 'pdf'
  | 'audio'
  | 'image'
  | 'doc'
  | 'pptx'
  | 'xlsx'
  | 'other'

export type StoredFileMeta = {
  id: string
  scopeId: string
  kind: StoredKind
  originalName: string
  mimeType: string
  size: number
  relativePath: string
  createdAt: string
  sha256: string
}

/** Default Mac vault: ~/ArabicBuzz/data */
export function getLocalStorageRoot(): string {
  const fromEnv = process.env.LOCAL_STORAGE_ROOT?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(os.homedir(), 'ArabicBuzz', 'data')
}

export function isLocalStorageEnabled(): boolean {
  if (process.env.STORAGE_BACKEND === 'none') return false
  if (process.env.STORAGE_BACKEND === 'local') return true
  // Auto: enable on non-Netlify / when explicitly allowed
  if (process.env.LOCAL_STORAGE_ROOT) return true
  if (process.env.NETLIFY === 'true' || process.env.NETLIFY_DEV === 'true') {
    return process.env.ALLOW_LOCAL_STORAGE_ON_NETLIFY === 'true'
  }
  return true
}

export function assertLocalStorageAvailable() {
  if (!isLocalStorageEnabled()) {
    throw new Error(
      'التخزين على الماك غير مفعّل هنا. شغّل Arabic Buzz محلياً على جهازك (npm run dev) أو اضبط LOCAL_STORAGE_ROOT.'
    )
  }
}

function safeSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF.]/g, '_').slice(0, 120)
}

function kindFromMime(mime: string, name: string): StoredKind {
  const lower = name.toLowerCase()
  if (mime.includes('pdf') || lower.endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('audio/') || /\.(ogg|mp3|wav|m4a|webm|opus)$/i.test(lower))
    return 'audio'
  if (mime.startsWith('image/')) return 'image'
  if (
    mime.includes('presentation') ||
    mime.includes('ms-powerpoint') ||
    /\.(pptx|ppt)$/i.test(lower)
  )
    return 'pptx'
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    /\.(xlsx|xls|csv)$/i.test(lower)
  )
    return 'xlsx'
  if (
    mime.includes('word') ||
    mime.includes('text') ||
    /\.(doc|docx|txt|md)$/i.test(lower)
  )
    return 'doc'
  return 'other'
}

function vaultDirs(scopeId: string) {
  const root = getLocalStorageRoot()
  const scope = path.join(root, 'scopes', safeSegment(scopeId))
  const files = path.join(scope, 'files')
  const metaDir = path.join(scope, 'meta')
  return { root, scope, files, metaDir }
}

export function ensureVault(scopeId = '_shared') {
  const dirs = vaultDirs(scopeId)
  for (const d of [dirs.root, dirs.scope, dirs.files, dirs.metaDir, path.join(dirs.root, 'inbox')]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true })
  }
  // marker README once
  const readme = path.join(dirs.root, 'README.txt')
  if (!existsSync(readme)) {
    writeFileSync(
      readme,
      `Arabic Buzz — local Mac vault
This folder stores PDFs, voice notes, and uploads for rooms.
Path: ${dirs.root}
Do not commit this folder to git.
`,
      'utf8'
    )
  }
  return dirs
}

export function saveLocalFile(opts: {
  scopeId: string
  buffer: Buffer
  originalName: string
  mimeType: string
}): StoredFileMeta {
  assertLocalStorageAvailable()
  const scopeId = opts.scopeId || 'shared-demo'
  const { files, metaDir } = ensureVault(scopeId)
  const id = randomUUID()
  const kind = kindFromMime(opts.mimeType, opts.originalName)
  const ext =
    path.extname(opts.originalName) ||
    (kind === 'pdf' ? '.pdf' : kind === 'audio' ? '.ogg' : '')
  const filename = `${id}${ext}`
  const abs = path.join(files, filename)
  writeFileSync(abs, opts.buffer)
  const sha256 = createHash('sha256').update(opts.buffer).digest('hex')
  const meta: StoredFileMeta = {
    id,
    scopeId,
    kind,
    originalName: opts.originalName,
    mimeType: opts.mimeType || 'application/octet-stream',
    size: opts.buffer.length,
    relativePath: path.join('scopes', safeSegment(scopeId), 'files', filename),
    createdAt: new Date().toISOString(),
    sha256,
  }
  writeFileSync(path.join(metaDir, `${id}.json`), JSON.stringify(meta, null, 2))
  // global index append
  const indexPath = path.join(getLocalStorageRoot(), 'index.jsonl')
  ensureVault(scopeId)
  writeFileSync(indexPath, `${JSON.stringify(meta)}\n`, { flag: 'a' })
  return meta
}

export function listLocalFiles(scopeId: string): StoredFileMeta[] {
  assertLocalStorageAvailable()
  const { metaDir } = ensureVault(scopeId)
  if (!existsSync(metaDir)) return []
  return readdirSync(metaDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(
          readFileSync(path.join(metaDir, f), 'utf8')
        ) as StoredFileMeta
      } catch {
        return null
      }
    })
    .filter((m): m is StoredFileMeta => Boolean(m))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function readLocalFile(
  scopeId: string,
  id: string
): { meta: StoredFileMeta; buffer: Buffer } | null {
  assertLocalStorageAvailable()
  const { metaDir, files } = ensureVault(scopeId)
  const metaPath = path.join(metaDir, `${id}.json`)
  if (!existsSync(metaPath)) return null
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as StoredFileMeta
  const abs = path.join(getLocalStorageRoot(), meta.relativePath)
  const fallback = path.join(
    files,
    path.basename(meta.relativePath)
  )
  const filePath = existsSync(abs) ? abs : fallback
  if (!existsSync(filePath)) return null
  return { meta, buffer: readFileSync(filePath) }
}

export function getStorageStatus() {
  const root = getLocalStorageRoot()
  const enabled = isLocalStorageEnabled()
  let bytes = 0
  let fileCount = 0
  if (enabled && existsSync(root)) {
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name)
        const st = statSync(p)
        if (st.isDirectory()) walk(p)
        else {
          bytes += st.size
          fileCount += 1
        }
      }
    }
    try {
      walk(root)
    } catch {
      /* ignore */
    }
  }
  return {
    enabled,
    root,
    fileCount,
    bytes,
    platform: process.platform,
    netlify: process.env.NETLIFY === 'true',
  }
}
